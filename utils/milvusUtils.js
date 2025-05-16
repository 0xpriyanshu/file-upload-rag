import { MilvusClient, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { createSchema } from './schema.js';
import config from '../config.js';
import { validateInput, handleError } from './utils.js';

// Global client pool with connection tracking
const clientPool = {};
let activeConnections = 0;
const MAX_CONNECTIONS = 200; // Increased for production multi-user environment

class MilvusClientManager {
  /**
   * Creates a new MilvusClientManager instance.
   * @param {string} collectionName - The name of the collection to manage.
   */
  constructor(collectionName) {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    this.client = new MilvusClient(config.MILVUS_ADDRESS);
    this.collectionName = collectionName;
    this.isLoaded = false;
    this.lastAccessTime = Date.now();
    activeConnections++;
  }

  /**
   * Creates a new collection in Milvus.
   * @throws {Error} If there's an error creating the collection or index.
   */
   async createCollection() {
    try {
      // First try to drop if it exists (ignore errors)
      try {
        await this.client.dropCollection({
          collection_name: this.collectionName
        }).catch(() => {});
      } catch (dropError) {
        console.warn(`Warning during collection drop: ${dropError.message}`);
        // Continue with creation anyway
      }
      
      // Small delay after dropping
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Now create a fresh collection
      const schema = createSchema(this.collectionName);
      const collectionSchema = {
        collection_name: this.collectionName,
        fields: schema,
      };
      
      await this.client.createCollection(collectionSchema);
      console.log(`Collection schema created for ${this.collectionName}`);
      
      // Small delay after creation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.createIndexes();
      console.log(`Indexes created for ${this.collectionName}`);
      
      // Small delay after index creation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.loadCollection();
      console.log(`Collection ${this.collectionName} loaded successfully`);
      
      // Verify collection is actually loaded - FIXED CHECK HERE
      const loadState = await this.client.getLoadState({
        collection_name: this.collectionName
      });
      
      console.log(`Load state after creation: ${JSON.stringify(loadState)}`);
      
      // Check specifically for the "LoadStateLoaded" state
      if (loadState.state === "LoadStateLoaded" || 
          (loadState.status && loadState.status.error_code === "Success")) {
        // Collection is properly loaded
        this.isLoaded = true;
        console.log(`Collection ${this.collectionName} verified as loaded`);
      } else {
        throw new Error(`Collection not properly loaded: ${JSON.stringify(loadState)}`);
      }
    } catch (error) {
      console.error(`Failed to create collection ${this.collectionName}: ${error.message}`);
      throw handleError('Error creating collection or index', error);
    }
  }
  /**
   * Creates indexes for the collection.
   * @throws {Error} If there's an error creating the index.
   */
  async createIndexes() {
    try {
      const indexParams = {
        collection_name: this.collectionName,
        field_name: 'vector',
        index_name: 'vector_index',
        extra_params: {
          index_type: IndexType.HNSW,  
          metric_type: MetricType.IP, // Inner Product is faster
          params: JSON.stringify({ 
            M: 8,              // Optimized for speed
            efConstruction: 64 // Optimized for speed
          }),
        },
      };

      await this.client.createIndex(indexParams);
      
      // Check that index was created successfully
      const indexInfo = await this.client.describeIndex({
        collection_name: this.collectionName,
        field_name: 'vector'
      });
      
      if (!indexInfo || !indexInfo.index_descriptions || indexInfo.index_descriptions.length === 0) {
        throw new Error('Index creation check failed');
      }
    } catch (error) {
      throw handleError('Error creating index', error);
    }
  }

  /**
   * Loads the collection into memory.
   * @throws {Error} If there's an error loading the collection.
   */
   async loadCollection() {
    if (this.isLoaded) return;
    
    try {
      await this.client.loadCollection({ collection_name: this.collectionName });
      
      // Verify collection is loaded
      const loadState = await this.client.getLoadState({
        collection_name: this.collectionName
      });
      
      // Fixed check for loaded state
      if (loadState.state === "LoadStateLoaded" || 
          (loadState.status && loadState.status.error_code === "Success")) {
        this.isLoaded = true;
        console.log(`Collection ${this.collectionName} loaded successfully`);
      } else {
        throw new Error('Collection load verification failed');
      }
    } catch (error) {
      // If loading fails, log warning but don't fail the operation
      console.warn(`Warning: Collection ${this.collectionName} loading issue: ${error.message}`);
    }
  }

  /**
   * Inserts embeddings into the collection.
   * @param {Array} embeddings - The embeddings to insert.
   * @throws {Error} If there's an error inserting the embeddings.
   */
   async insertEmbeddingIntoStore(embeddings) {
    validateInput(embeddings, 'array', 'Embeddings must be a non-empty array');
    try {
      // Add more detailed logging
      console.log(`Preparing to insert ${embeddings.length} embeddings into ${this.collectionName}`);
      
      // Validate vector dimensions
      const vectorDimension = embeddings[0]?.vector?.length;
      console.log(`Vector dimension: ${vectorDimension}`);
      
      // Make sure all fields are present in each embedding
      const fieldsData = embeddings.map((e, index) => {
        if (!e.vector || !Array.isArray(e.vector)) {
          console.error(`Invalid vector at index ${index}`);
          throw new Error(`Invalid vector at index ${index}: vector must be an array`);
        }
        
        return {
          vector: e.vector,
          text: e.text || '',
          documentId: e.documentId || '',
          timestamp: e.timestamp || Date.now()
        };
      });
      
      // Log first item for debugging
      console.log(`First item sample: ${JSON.stringify({
        vector_length: fieldsData[0].vector.length,
        text_length: fieldsData[0].text.length,
        documentId: fieldsData[0].documentId
      })}`);
      
      const insertResult = await this.client.insert({
        collection_name: this.collectionName,
        fields_data: fieldsData,
      });
      
      console.log(`Insert result: ${JSON.stringify(insertResult)}`);
      return insertResult;
    } catch (error) {
      console.error('Detailed insert error:', error);
      throw handleError('Error inserting embeddings', error);
    }
  }

  /**
   * Verifies the existence of the collection and creates it if it doesn't exist.
   * @throws {Error} If there's an error verifying or creating the collection.
   */
  async verifyCollection() {
    try {
      const exists = await this.client.hasCollection({
        collection_name: this.collectionName
      });
      
      if (!exists) {
        await this.createCollection();
        return;
      }
      
      await this.loadCollection();
    } catch (error) {
      // If verification fails, still continue
      console.warn(`Warning: Collection ${this.collectionName} verification issue:`, error.message);
      // We'll try to use it anyway, might be a transient error
    }
  }

  /**
   * Searches for similar embeddings in the collection.
   * @param {number[]} embedding - The embedding to search for.
   * @returns {Promise<Array>} The search results.
   */
   async searchEmbeddingFromStore(embedding) {
    try {
      this.lastAccessTime = Date.now();
      
      // Always ensure collection is loaded
      if (!this.isLoaded) {
        await this.loadCollection();
      }
      
      const searchParams = {
        collection_name: this.collectionName,
        output_fields: ["id", "text", "documentId", "timestamp"], 
        limit: config.MILVUS_TOP_K,
        data: [
          {
            anns_field: "vector",
            data: embedding,
            params: {
              ef: 250 ,
              topk: config.MILVUS_TOP_K
            }
          }
        ],
        consistency_level: "Bounded" 
      };
      
      
      const res = await this.client.search(searchParams);
      
      if (!res || !res.results || res.results.length === 0) {
        console.log('No results found in search');
        return [];
      }
      
      return res.results
        .map(item => {
          let text = null;
          
          if (item.fields && item.fields.text) {
            text = item.fields.text;
          } else if (item.entity && item.entity.text) {
            text = item.entity.text;
          } else if (item.text) {
            text = item.text;
          }
          
          return {
            text: text || '',
            documentId: (item.fields && item.fields.documentId) || 
                       (item.entity && item.entity.documentId) || 
                       item.documentId || '',
            score: item.score || 0
          };
        })
        .filter(item => item.text && item.text.trim() !== '');
    } catch (error) {
      console.error(`Search error in collection ${this.collectionName}:`, error.message);
      return [];
    }
  }

  /**
   * Release the client connection to free up resources
   */
  releaseConnection() {
    if (activeConnections > 0) {
      activeConnections--;
    }
    this.isLoaded = false;
  }
}

/**
 * Get client from pool or create new one with resource management
 * @param {string} collectionName - Collection name
 * @returns {MilvusClientManager} - Client instance
 */
const getClientFromPool = (collectionName) => {
  try {
    // Update access time if client exists
    if (clientPool[collectionName]) {
      clientPool[collectionName].lastAccessTime = Date.now();
      return clientPool[collectionName];
    }
    
    // Check if we've reached max connections
    if (activeConnections >= MAX_CONNECTIONS) {
      // Find least recently used client
      const clientEntries = Object.entries(clientPool);
      if (clientEntries.length > 0) {
        clientEntries.sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
        
        // Take oldest 10% of connections to free up
        const connectionsToFree = Math.max(1, Math.floor(clientEntries.length * 0.1));
        for (let i = 0; i < connectionsToFree; i++) {
          if (i < clientEntries.length) {
            const [lruCollection, lruClient] = clientEntries[i];
            lruClient.releaseConnection();
            delete clientPool[lruCollection];
          }
        }
      }
    }
    
    // Create new client
    clientPool[collectionName] = new MilvusClientManager(collectionName);
    return clientPool[collectionName];
  } catch (error) {
    // If error in pool management, create a new client without pooling
    console.error('Connection pool error:', error.message);
    return new MilvusClientManager(collectionName);
  }
};

/**
 * Preload collections on startup
 * @param {string[]} collectionNames - Array of collection names to preload
 */
const preloadCollections = async (collectionNames) => {
  try {
    console.log(`Preloading ${collectionNames.length} collections...`);
    
    // Preload in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < collectionNames.length; i += batchSize) {
      const batch = collectionNames.slice(i, i + batchSize);
      await Promise.all(batch.map(async (name) => {
        try {
          const client = getClientFromPool(name);
          await client.loadCollection();
          console.log(`Preloaded collection: ${name}`);
        } catch (error) {
          console.warn(`Failed to preload collection ${name}:`, error.message);
        }
      }));
      
      // Small delay between batches
      if (i + batchSize < collectionNames.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('Collection preloading complete');
  } catch (error) {
    console.error('Error in collection preloading:', error.message);
  }
};

/**
 * Get pool statistics for monitoring
 * @returns {Object} - Statistics about the client pool
 */
const getPoolStats = () => {
  const clients = Object.keys(clientPool).length;
  const loadedClients = Object.values(clientPool).filter(client => client.isLoaded).length;
  
  return {
    totalClients: clients,
    activeConnections,
    loadedCollections: loadedClients,
    maxConnections: MAX_CONNECTIONS,
    freeConnections: MAX_CONNECTIONS - activeConnections
  };
};

/**
 * Cleanup idle connections periodically
 * @param {number} maxIdleTime - Maximum idle time in milliseconds
 */
const cleanupIdleConnections = (maxIdleTime = 30 * 60 * 1000) => { // Default 30 minutes
  try {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.entries(clientPool).forEach(([collection, client]) => {
      if (now - client.lastAccessTime > maxIdleTime) {
        client.releaseConnection();
        delete clientPool[collection];
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} idle connections`);
    }
  } catch (error) {
    console.error('Error cleaning up idle connections:', error.message);
  }
};

/**
 * Start periodic connection cleanup
 */
const startConnectionCleanup = () => {
  // Run cleanup every 10 minutes
  setInterval(() => {
    cleanupIdleConnections();
  }, 10 * 60 * 1000);
  
  console.log('Connection cleanup scheduler started');
};

export { 
  MilvusClientManager, 
  getClientFromPool, 
  preloadCollections, 
  getPoolStats, 
  startConnectionCleanup 
};