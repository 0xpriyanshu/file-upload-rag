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
 * Diagnostic function to check collection contents
 * @param {string} collectionName - The name of the collection to check
 * @returns {Promise<Object>} Diagnostic information about the collection
 */
 async function diagnoseCollection(collectionName) {
  try {
    console.log(`Running diagnostics on collection: ${collectionName}`);
    
    // Get client from pool
    const milvusClient = getClientFromPool(collectionName);
    
    // Ensure collection is loaded
    if (!milvusClient.isLoaded) {
      await milvusClient.loadCollection();
    }
    
    // Get collection statistics
    const stats = await milvusClient.client.getCollectionStatistics({
      collection_name: collectionName
    });
    
    console.log(`Collection stats: ${JSON.stringify(stats)}`);
    
    // Check row count - handle different response formats
    let rowCount = 0;
    
    // Format 1: stats.stats.row_count (object format)
    if (stats && stats.stats && stats.stats.row_count) {
      rowCount = parseInt(stats.stats.row_count);
    } 
    // Format 2: stats.stats[{key: "row_count", value: "X"}] (array format)
    else if (stats && stats.stats && Array.isArray(stats.stats)) {
      const rowCountItem = stats.stats.find(item => item.key === "row_count");
      if (rowCountItem && rowCountItem.value) {
        rowCount = parseInt(rowCountItem.value);
      }
    }
    
    console.log(`Parsed row count: ${rowCount}`);
    
    if (rowCount === 0) {
      return {
        status: "empty",
        message: "Collection is empty",
        rowCount: 0
      };
    }
    
    // Execute a raw query to see all data in the collection (limited to 100 rows)
    const queryResult = await milvusClient.client.query({
      collection_name: collectionName,
      output_fields: ["documentId", "source_type", "text"],
      limit: Math.min(rowCount, 100)
    });
    
    console.log(`Query result: ${JSON.stringify(queryResult)}`);
    
    if (!queryResult || !queryResult.data || queryResult.data.length === 0) {
      return {
        status: "queryFailed",
        message: "Query returned no results despite collection having data",
        rowCount,
        originalStats: stats
      };
    }
    
    // Analyze source types
    const sourceTypes = {};
    const documentIds = new Set();
    
    queryResult.data.forEach(item => {
      // Track source types
      const sourceType = item.source_type || "undefined";
      sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1;
      
      // Track unique document IDs
      if (item.documentId) {
        documentIds.add(item.documentId);
      }
    });
    
    // Get sample texts to understand the data
    const sampleTexts = queryResult.data
      .slice(0, 2)
      .map(item => ({
        documentId: item.documentId,
        source_type: item.source_type,
        textPreview: item.text ? item.text.substring(0, 100) + '...' : 'No text'
      }));
    
    return {
      status: "success",
      rowCount,
      sampledRows: queryResult.data.length,
      sourceTypes,
      uniqueDocuments: documentIds.size,
      sampleDocumentIds: Array.from(documentIds).slice(0, 10), // Show first 10 document IDs
      sampleTexts
    };
  } catch (error) {
    console.error('Error in diagnoseCollection:', error);
    return {
      status: "error",
      message: error.message,
      stack: error.stack
    };
  }
}

/**
 * Queries a document collection based on input with proper vector search.
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
      console.error('Invalid collection name or input');
      return [];
    }
    
    // First, let's check what's in the collection
    const diagnostics = await diagnoseCollection(collectionName);
    console.log(`Collection diagnostics summary: status=${diagnostics.status}, rowCount=${diagnostics.rowCount}`);
    
    if (diagnostics.status === "empty" || diagnostics.rowCount === 0) {
      console.log('Collection is empty - no search needed');
      return [];
    }
    
    const isPromptGeneration = input.includes("generate cues/prompts for the agent");
    
    // For prompt generation, we never include kifor docs
    // For regular queries, include kifor docs if the query is about kifor or if requested
    const includeKifor = !isPromptGeneration && (checkIfKiforQuery(input) || options.includeKifor === true);
    
    console.log(`Query type: ${isPromptGeneration ? 'Prompt Generation' : 'Regular'}, Include Kifor: ${includeKifor}`);
    
    // Normalize input to increase cache hits
    const normalizedInput = input.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Cache key based on query type and kifor inclusion
    const cacheKey = includeKifor 
      ? `${collectionName}:${normalizedInput}:with_kifor` 
      : `${collectionName}:${normalizedInput}:no_kifor`;
      
    const cachedResults = queryCache.get(cacheKey);
    
    if (cachedResults) {
      queryCacheHits++;
      console.log(`Cache hit! Returning ${cachedResults.length} cached results`);
      return cachedResults;
    }
    
    // Get embedding for vector search
    const embedding = await createQueryEmbeddings(normalizedInput);
    
    // Use client from pool
    const milvusClient = getClientFromPool(collectionName);
    
    console.log(`Starting vector search on collection ${collectionName}`);
    
    // TWO-PHASE APPROACH: First get IDs via vector search, then retrieve full documents
    
    // PHASE 1: Perform vector search to get ranked IDs
    const searchParams = {
      collection_name: collectionName,
      vectors: [embedding],
      output_fields: ["id"],  // Only get IDs first
      vector_field: "vector",
      limit: config.MILVUS_TOP_K
    };
    
    console.log(`Executing vector search with params: ${JSON.stringify(searchParams)}`);
    const searchResult = await milvusClient.client.search(searchParams);
    
    if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
      console.log('No search results found');
      return [];
    }
    
    console.log(`Vector search returned ${searchResult.results.length} results`);
    
    // Extract IDs from search results
    const documentIds = [];
    for (const hit of searchResult.results) {
      if (hit.id) {
        documentIds.push(hit.id);
      } else if (hit.fields && hit.fields.id) {
        documentIds.push(hit.fields.id);
      } else if (hit.entity && hit.entity.id) {
        documentIds.push(hit.entity.id);
      }
    }
    
    if (documentIds.length === 0) {
      console.log('No valid IDs found in search results');
      return [];
    }
    
    console.log(`Extracted ${documentIds.length} valid IDs from search results`);
    
    // PHASE 2: Query for the full documents by ID to get all fields
    const idFilter = `id in [${documentIds.join(',')}]`;
    const queryParams = {
      collection_name: collectionName,
      filter: idFilter,
      output_fields: ["id", "documentId", "source_type", "text"],
      limit: documentIds.length
    };
    
    console.log(`Querying full documents with filter: ${idFilter}`);
    const fullDocuments = await milvusClient.client.query(queryParams);
    
    if (!fullDocuments || !fullDocuments.data || fullDocuments.data.length === 0) {
      console.log('No full documents retrieved');
      return [];
    }
    
    console.log(`Retrieved ${fullDocuments.data.length} full documents`);
    
    // Create a map to preserve the original ordering from the vector search
    const idToRankMap = {};
    documentIds.forEach((id, index) => {
      idToRankMap[id] = index;
    });
    
    // Filter and sort documents
    const filteredDocuments = fullDocuments.data
      .filter(doc => {
        const isKiforDoc = 
          (doc.source_type === "kifor_platform") || 
          (doc.documentId && doc.documentId.includes("kifordoc_"));
        
        // Skip Kifor docs based on the query type and settings
        if (isPromptGeneration && isKiforDoc) {
          console.log(`Filtering out Kifor document ID: ${doc.documentId}`);
          return false;
        }
        
        if (!isPromptGeneration && !includeKifor && isKiforDoc) {
          console.log(`Filtering out Kifor document for regular query: ${doc.documentId}`);
          return false;
        }
        
        return doc.text && doc.text.trim() !== '';
      })
      .sort((a, b) => {
        // Restore original vector search ranking
        return idToRankMap[a.id] - idToRankMap[b.id];
      });
    
    console.log(`After filtering, ${filteredDocuments.length} documents remain`);
    
    // Extract text from the filtered and sorted documents
    const textResults = filteredDocuments.map(doc => doc.text);
    
    // Cache the results
    queryCache.set(cacheKey, textResults);
    
    return textResults;
  } catch (error) {
    console.error('Error in queryFromDocument:', error);
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