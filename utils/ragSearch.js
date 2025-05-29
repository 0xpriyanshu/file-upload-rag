import { OpenAIEmbeddings } from "@langchain/openai";
import { getClientFromPool, getPoolStats } from "./milvusUtils.js";
import config from '../config.js';
import { validateInput } from './utils.js';
import NodeCache from 'node-cache';

const queryCache = new NodeCache({ 
  stdTTL: 86400,
  maxKeys: 100000,
  checkperiod: 600
});

const embeddingCache = new NodeCache({ 
  stdTTL: 604800,
  maxKeys: 50000,
  checkperiod: 1800
});

const agentCollectionCache = new NodeCache({
  stdTTL: 86400,
  maxKeys: 10000
});

let totalQueryRequests = 0;
let queryCacheHits = 0;
let totalEmbeddingRequests = 0;
let embeddingCacheHits = 0;

let embeddingsModel = null;

const getEmbeddingsModel = () => {
  if (!embeddingsModel) {
    embeddingsModel = new OpenAIEmbeddings({
      model: config.OPENAI_MODEL,
      apiKey: config.OPENAI_API_KEY,
      timeout: 3000,
      maxRetries: 2,
      maxConcurrency: 20
    });
  }
  return embeddingsModel;
};

const createQueryEmbeddings = async (query) => {
  try {
    totalEmbeddingRequests++;
    
    const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
    
    const cacheKey = `embedding:${normalizedQuery}`;
    const cachedEmbedding = embeddingCache.get(cacheKey);
    
    if (cachedEmbedding) {
      embeddingCacheHits++;
      return cachedEmbedding;
    }
    
    const model = getEmbeddingsModel();
    
    const embeddings = await model.embedDocuments([normalizedQuery]);
    const embedding = embeddings[0];
    
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch (error) {
    console.error('Error generating embeddings:', error.message);
    
    return Array(1536).fill(0);
  }
};

const cacheAgentCollection = (agentId, collectionName) => {
  if (agentId && collectionName) {
    agentCollectionCache.set(agentId, collectionName);
  }
};

const getCollectionNameForAgent = async (agentId, fetchFromDb) => {
  const cachedCollection = agentCollectionCache.get(agentId);
  if (cachedCollection) {
    return cachedCollection;
  }
  
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

async function diagnoseCollection(collectionName) {
  try {
    const milvusClient = getClientFromPool(collectionName);
    
    if (!milvusClient.isLoaded) {
      await milvusClient.loadCollection();
    }
    
    const stats = await milvusClient.client.getCollectionStatistics({
      collection_name: collectionName
    });
    
    let rowCount = 0;
    
    if (stats && stats.stats && stats.stats.row_count) {
      rowCount = parseInt(stats.stats.row_count);
    } 
    else if (stats && stats.stats && Array.isArray(stats.stats)) {
      const rowCountItem = stats.stats.find(item => item.key === "row_count");
      if (rowCountItem && rowCountItem.value) {
        rowCount = parseInt(rowCountItem.value);
      }
    }
    
    if (rowCount === 0) {
      return {
        status: "empty",
        message: "Collection is empty",
        rowCount: 0
      };
    }
    
    const queryResult = await milvusClient.client.query({
      collection_name: collectionName,
      output_fields: ["documentId", "text"],
      limit: Math.min(rowCount, 100)
    });
    
    if (!queryResult || !queryResult.data || queryResult.data.length === 0) {
      return {
        status: "queryFailed",
        message: "Query returned no results despite collection having data",
        rowCount,
        originalStats: stats
      };
    }
    
    const documentIds = new Set();
    
    queryResult.data.forEach(item => {
      if (item.documentId) {
        documentIds.add(item.documentId);
      }
    });
    
    const sampleTexts = queryResult.data
      .slice(0, 2)
      .map(item => ({
        documentId: item.documentId,
        textPreview: item.text ? item.text.substring(0, 100) + '...' : 'No text'
      }));
    
    return {
      status: "success",
      rowCount,
      sampledRows: queryResult.data.length,
      uniqueDocuments: documentIds.size,
      sampleDocumentIds: Array.from(documentIds).slice(0, 10),
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

const queryFromDocument = async (collectionName, input, options = {}) => {
  try {
    totalQueryRequests++;
    
    if (!collectionName || typeof collectionName !== 'string' || !input || typeof input !== 'string') {
      console.error('Invalid collection name or input');
      return [];
    }
    
    const normalizedQuery = input.toLowerCase().trim();
    const cacheKey = `${collectionName}:${normalizedQuery}`;
      
    const cachedResults = queryCache.get(cacheKey);
    
    if (cachedResults) {
      queryCacheHits++;
      return cachedResults;
    }
    
    const embedding = await createQueryEmbeddings(normalizedQuery);
    
    const milvusClient = getClientFromPool(collectionName);
    
    const searchParams = {
      collection_name: collectionName,
      vectors: [embedding],
      output_fields: ["id", "documentId", "text"],
      vector_field: "vector",
      limit: config.MILVUS_TOP_K
    };
    
    const searchResult = await milvusClient.client.search(searchParams);
    
    if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
      return [];
    }
    
    const textResults = [];
    
    for (const hit of searchResult.results) {
      const text = hit.text;
      
      if (!text || text.trim() === '') {
        continue;
      }
      
      textResults.push(text);
    }
    
    queryCache.set(cacheKey, textResults);
    
    return textResults;
  } catch (error) {
    console.error('Error in queryFromDocument:', error);
    return [];
  }
};

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

const clearQueryCache = () => {
  queryCache.flushAll();
};

const clearEmbeddingCache = () => {
  embeddingCache.flushAll();
};

const startCacheCleanup = () => {
  const cleanupInterval = setInterval(() => {
    try {
      if (queryCache.keys().length > 80000) {
        const newCache = new NodeCache({ stdTTL: 86400 });
        
        const keys = queryCache.keys();
        const items = [];
        
        for (const key of keys) {
          const ttl = queryCache.getTtl(key);
          if (ttl) {
            items.push({ key, ttl });
          }
        }
        
        items.sort((a, b) => b.ttl - a.ttl);
        
        const keepItems = items.slice(0, 50000);
        
        for (const item of keepItems) {
          const value = queryCache.get(item.key);
          if (value) {
            newCache.set(item.key, value, (item.ttl - Date.now()) / 1000);
          }
        }
        
        queryCache.flushAll();
        queryCache._options = newCache._options;
        for (const key of newCache.keys()) {
          queryCache.set(key, newCache.get(key), newCache.getTtl(key));
        }
      }
      
      if (embeddingCache.keys().length > 40000) {
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
      }
    } catch (error) {
      console.error('Error in cache cleanup:', error.message);
    }
  }, 15 * 60 * 1000);
  
  cleanupInterval.unref();
};

const initializeRAGSystem = () => {
  try {
    startCacheCleanup();
    
    getEmbeddingsModel();
    
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