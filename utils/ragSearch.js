import { OpenAIEmbeddings } from "@langchain/openai";
import { getClientFromPool, getPoolStats } from "./milvusUtils.js";
import config from '../config.js';
import { validateInput } from './utils.js';
import NodeCache from 'node-cache';

// Memory-managed caches with size limits
const queryCache = new NodeCache({ 
  stdTTL: 86400,      // 24-hour TTL 
  maxKeys: 100000,    // Cache size for production
  checkperiod: 600    // Check for expired keys every 10 minutes
});

const embeddingCache = new NodeCache({ 
  stdTTL: 604800,     // 7-day TTL
  maxKeys: 50000,     // Cache size for production
  checkperiod: 1800   // Check every 30 minutes
});

// Cache for mapping agentId to collectionName
const agentCollectionCache = new NodeCache({
  stdTTL: 86400,      // 24-hour TTL
  maxKeys: 10000      // Should cover all your agents
});

// Stats tracking
let totalQueryRequests = 0;
let queryCacheHits = 0;
let totalEmbeddingRequests = 0;
let embeddingCacheHits = 0;

// Single OpenAI embeddings instance for the entire application
let embeddingsModel = null;

/**
 * Get singleton embeddings model
 * @returns {OpenAIEmbeddings} - OpenAI embeddings model
 */
const getEmbeddingsModel = () => {
  if (!embeddingsModel) {
    embeddingsModel = new OpenAIEmbeddings({
      model: config.OPENAI_MODEL,
      apiKey: config.OPENAI_API_KEY,
      timeout: 3000,
      maxRetries: 2,
      maxConcurrency: 20 // Increased for production
    });
  }
  return embeddingsModel;
};

/**
 * Creates embeddings for a given query using OpenAI's API.
 * @param {string} query - The query to create embeddings for.
 * @returns {Promise<number[]>} The embedding vector.
 */
const createQueryEmbeddings = async (query) => {
  try {
    totalEmbeddingRequests++;
    
    // Normalize query to increase cache hits
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Check cache first
    const cacheKey = `embedding:${normalizedQuery}`;
    const cachedEmbedding = embeddingCache.get(cacheKey);
    
    if (cachedEmbedding) {
      embeddingCacheHits++;
      return cachedEmbedding;
    }
    
    // Get model singleton
    const model = getEmbeddingsModel();
    
    // Generate embedding
    const embeddings = await model.embedDocuments([normalizedQuery]);
    const embedding = embeddings[0];
    
    // Cache result
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch (error) {
    console.error('Error generating embeddings:', error.message);
    
    // Return zeros embedding for fallback
    return Array(1536).fill(0);
  }
};

/**
 * Helper function to determine if query is about Kifor
 * @param {string} query - The query to check
 * @returns {boolean} True if the query is about Kifor
 */
function checkIfKiforQuery(query) {
  if (!query) return false;
  
  const normalizedQuery = query.toLowerCase().trim();
  
  const kiforVariations = [
    'kifor', 
    'ki for', 
    'key for', 
    'ki 4',
    'key 4',
    'key-for',
    'ki-for',
    'k for',
    'k4',
    'kiframe',
    'ki frame',
    'ki-frame'
  ];
  
  return kiforVariations.some(term => normalizedQuery.includes(term));
}

/**
 * Set collection name for agent in cache
 * @param {string} agentId - Agent ID
 * @param {string} collectionName - Collection name
 */
const cacheAgentCollection = (agentId, collectionName) => {
  if (agentId && collectionName) {
    agentCollectionCache.set(agentId, collectionName);
  }
};

/**
 * Get collection name for agent from cache or database
 * @param {string} agentId - Agent ID
 * @param {Function} fetchFromDb - Function to fetch from database if not in cache
 * @returns {Promise<string|null>} - Collection name or null
 */
const getCollectionNameForAgent = async (agentId, fetchFromDb) => {
  // Check cache first
  const cachedCollection = agentCollectionCache.get(agentId);
  if (cachedCollection) {
    return cachedCollection;
  }
  
  // Fetch from database if provided
  if (typeof fetchFromDb === 'function') {
    try {
      const collectionName = await fetchFromDb(agentId);
      if (collectionName) {
        agentCollectionCache.set(agentId, collectionName);
        return collectionName;
      }
    } catch (error) {
      console.error('Error fetching collection name:', error.message);
    }
  }
  
  return null;
};

/**
 * Queries a document collection based on input.
 * @param {string} collectionName - The name of the collection to query.
 * @param {string} input - The input query.
 * @param {Object} options - Query options.
 * @param {boolean} [options.includeKifor=false] - Whether to include Kifor docs.
 * @returns {Promise<string[]>} An array of relevant text chunks.
 */
 const queryFromDocument = async (collectionName, input, options = {}) => {
  try {
    totalQueryRequests++;
    
    // Input validation with fallback
    if (!collectionName || typeof collectionName !== 'string' || !input || typeof input !== 'string') {
      return [];
    }
    
    const isPromptGeneration = input.includes("generate cues/prompts for the agent");
    const includeKifor = !isPromptGeneration && (checkIfKiforQuery(input) || options.includeKifor === true);
    
    // Normalize input to increase cache hits
    const normalizedInput = input.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Check cache first - most critical optimization
    const cacheKey = includeKifor 
      ? `${collectionName}:${normalizedInput}:with_kifor` 
      : `${collectionName}:${normalizedInput}:no_kifor`;
      
    const cachedResults = queryCache.get(cacheKey);
    
    if (cachedResults) {
      queryCacheHits++;
      return cachedResults;
    }
    
    // Use client from pool
    const milvusClient = getClientFromPool(collectionName);
    
    // Get embedding - will use cache if available
    const embedding = await createQueryEmbeddings(normalizedInput);
    
    console.log(`Searching collection ${collectionName} with${includeKifor ? '' : 'out'} Kifor docs`);
    
    const searchParams = {
      anns_field: "vector",
      topk: config.MILVUS_TOP_K,
      metric_type: "IP",
      params: { ef: 250 }
    };
    
    if (!includeKifor) {
      searchParams.filter = `source_type != "kifor_platform"`;
    }
    
    const searchResults = await milvusClient.client.search({
      collection_name: collectionName,
      vectors: [embedding],
      search_params: searchParams,
      output_fields: ["text", "documentId", "source_type"]
    });
    
    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      console.log('No search results found');
      return [];
    }
    
    // Process results
    const textResults = searchResults.results.map(item => {
      let text = null;
      if (item.entity && item.entity.text) {
        text = item.entity.text;
      } else if (item.fields && item.fields.text) {
        text = item.fields.text;
      }
      return text;
    }).filter(text => text && text.trim().length > 0);
    
    console.log(`Found ${textResults.length} relevant chunks`);
    
    // Cache results
    queryCache.set(cacheKey, textResults);
    
    return textResults;
  } catch (error) {
    console.error('Error in queryFromDocument:', error.message);
    // Fail gracefully with empty results
    return [];
  }
};

/**
 * Get system statistics
 * @returns {Object} - System statistics
 */
const getSystemStats = () => {
  try {
    const stats = {
      queryCacheStats: {
        hitRate: totalQueryRequests > 0 ? queryCacheHits / totalQueryRequests : 0,
        keys: queryCache.keys().length
      },
      embeddingCacheStats: {
        hitRate: totalEmbeddingRequests > 0 ? embeddingCacheHits / totalEmbeddingRequests : 0,
        keys: embeddingCache.keys().length
      },
      agentCollectionCacheStats: {
        keys: agentCollectionCache.keys().length
      },
      totalRequests: totalQueryRequests,
      totalEmbeddingRequests: totalEmbeddingRequests,
      poolStats: getPoolStats()
    };
    
    return stats;
  } catch (error) {
    console.error('Error generating system stats:', error.message);
    return {
      error: 'Error generating stats',
      message: error.message
    };
  }
};

/**
 * Clear query cache
 */
const clearQueryCache = () => {
  queryCache.flushAll();
  console.log('Query cache cleared');
};

/**
 * Clear embedding cache
 */
const clearEmbeddingCache = () => {
  embeddingCache.flushAll();
  console.log('Embedding cache cleared');
};

/**
 * Run cache cleanup every 15 minutes
 */
const startCacheCleanup = () => {
  // Check cache sizes periodically
  const cleanupInterval = setInterval(() => {
    try {
      // Log cache stats
      console.log(`Cache stats: ${queryCache.keys().length} query keys, ${embeddingCache.keys().length} embedding keys`);
      
      // If query cache gets too large, keep only newest items
      if (queryCache.keys().length > 80000) {
        console.log('Query cache pruning triggered');
        const newCache = new NodeCache({ stdTTL: 86400 });
        
        // Get all keys with TTL info
        const keys = queryCache.keys();
        const items = [];
        
        for (const key of keys) {
          const ttl = queryCache.getTtl(key);
          if (ttl) {
            items.push({ key, ttl });
          }
        }
        
        // Sort by TTL (newest first)
        items.sort((a, b) => b.ttl - a.ttl);
        
        // Keep top 50000 items
        const keepItems = items.slice(0, 50000);
        
        // Add to new cache
        for (const item of keepItems) {
          const value = queryCache.get(item.key);
          if (value) {
            newCache.set(item.key, value, (item.ttl - Date.now()) / 1000);
          }
        }
        
        // Replace cache
        queryCache.flushAll();
        queryCache._options = newCache._options;
        for (const key of newCache.keys()) {
          queryCache.set(key, newCache.get(key), newCache.getTtl(key));
        }
        
        console.log(`Query cache pruned to ${queryCache.keys().length} items`);
      }
      
      // Similar for embedding cache
      if (embeddingCache.keys().length > 40000) {
        console.log('Embedding cache pruning triggered');
        // Same logic as above but keep fewer items
        const newCache = new NodeCache({ stdTTL: 604800 });
        
        const keys = embeddingCache.keys();
        const items = [];
        
        for (const key of keys) {
          const ttl = embeddingCache.getTtl(key);
          if (ttl) {
            items.push({ key, ttl });
          }
        }
        
        items.sort((a, b) => b.ttl - a.ttl);
        
        const keepItems = items.slice(0, 25000);
        
        for (const item of keepItems) {
          const value = embeddingCache.get(item.key);
          if (value) {
            newCache.set(item.key, value, (item.ttl - Date.now()) / 1000);
          }
        }
        
        embeddingCache.flushAll();
        embeddingCache._options = newCache._options;
        for (const key of newCache.keys()) {
          embeddingCache.set(key, newCache.get(key), newCache.getTtl(key));
        }
        
        console.log(`Embedding cache pruned to ${embeddingCache.keys().length} items`);
      }
    } catch (error) {
      console.error('Error in cache cleanup:', error.message);
    }
  }, 15 * 60 * 1000);
  
  // Make sure the interval doesn't prevent the process from exiting
  cleanupInterval.unref();
};

/**
 * Initialize the RAG system
 */
const initializeRAGSystem = () => {
  try {
    // Start cache cleanup
    startCacheCleanup();
    
    // Initialize embeddings model
    getEmbeddingsModel();
    
    console.log('RAG system initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing RAG system:', error.message);
    return false;
  }
};

export { 
  queryFromDocument, 
  createQueryEmbeddings,
  clearQueryCache,
  clearEmbeddingCache,
  getSystemStats,
  initializeRAGSystem,
  cacheAgentCollection,
  getCollectionNameForAgent
};