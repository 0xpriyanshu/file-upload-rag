import { MilvusClient, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { createSchema } from './schema.js';
import config from '../config.js';
import { validateInput, handleError } from './utils.js';

const clientPool = {};
let activeConnections = 0;
const MAX_CONNECTIONS = 200;

class MilvusClientManager {
  constructor(collectionName) {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    this.client = new MilvusClient(config.MILVUS_ADDRESS);
    this.collectionName = collectionName;
    this.isLoaded = false;
    this.lastAccessTime = Date.now();
    activeConnections++;
  }

  async createCollection() {
    try {
      try {
        await this.client.dropCollection({
          collection_name: this.collectionName
        }).catch(() => {});
      } catch (dropError) {
        console.warn(`Warning during collection drop: ${dropError.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const schema = createSchema(this.collectionName);
      const collectionSchema = {
        collection_name: this.collectionName,
        fields: schema,
      };
      
      await this.client.createCollection(collectionSchema);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.createIndexes();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await this.loadCollection();
      
      const loadState = await this.client.getLoadState({
        collection_name: this.collectionName
      });
      
      if (loadState.state === "LoadStateLoaded" || 
          (loadState.status && loadState.status.error_code === "Success")) {
        this.isLoaded = true;
      } else {
        throw new Error(`Collection not properly loaded: ${JSON.stringify(loadState)}`);
      }
    } catch (error) {
      console.error(`Failed to create collection ${this.collectionName}: ${error.message}`);
      throw handleError('Error creating collection or index', error);
    }
  }

  async createIndexes() {
    try {
      const indexParams = {
        collection_name: this.collectionName,
        field_name: 'vector',
        index_name: 'vector_index',
        extra_params: {
          index_type: IndexType.HNSW,  
          metric_type: MetricType.IP,
          params: JSON.stringify({ 
            M: 8,
            efConstruction: 64
          }),
        },
      };

      await this.client.createIndex(indexParams);
      
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

  async loadCollection() {
    if (this.isLoaded) return;
    
    try {
      await this.client.loadCollection({ collection_name: this.collectionName });
      
      const loadState = await this.client.getLoadState({
        collection_name: this.collectionName
      });
      
      if (loadState.state === "LoadStateLoaded" || 
          (loadState.status && loadState.status.error_code === "Success")) {
        this.isLoaded = true;
      } else {
        throw new Error('Collection load verification failed');
      }
    } catch (error) {
      console.warn(`Warning: Collection ${this.collectionName} loading issue: ${error.message}`);
    }
  }

  async insertEmbeddingIntoStore(embeddings) {
    validateInput(embeddings, 'array', 'Embeddings must be a non-empty array');
    try {
      const vectorDimension = embeddings[0]?.vector?.length;
      
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
      
      const insertResult = await this.client.insert({
        collection_name: this.collectionName,
        fields_data: fieldsData,
      });
      
      return insertResult;
    } catch (error) {
      console.error('Detailed insert error:', error);
      throw handleError('Error inserting embeddings', error);
    }
  }

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
      console.warn(`Warning: Collection ${this.collectionName} verification issue:`, error.message);
    }
  }

  async searchEmbeddingFromStore(embedding) {
    try {
      this.lastAccessTime = Date.now();
      
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

  releaseConnection() {
    if (activeConnections > 0) {
      activeConnections--;
    }
    this.isLoaded = false;
  }
}

const getClientFromPool = (collectionName) => {
  try {
    if (clientPool[collectionName]) {
      clientPool[collectionName].lastAccessTime = Date.now();
      return clientPool[collectionName];
    }
    
    if (activeConnections >= MAX_CONNECTIONS) {
      const clientEntries = Object.entries(clientPool);
      if (clientEntries.length > 0) {
        clientEntries.sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
        
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
    
    clientPool[collectionName] = new MilvusClientManager(collectionName);
    return clientPool[collectionName];
  } catch (error) {
    console.error('Connection pool error:', error.message);
    return new MilvusClientManager(collectionName);
  }
};

const preloadCollections = async (collectionNames) => {
  try {
    const batchSize = 5;
    for (let i = 0; i < collectionNames.length; i += batchSize) {
      const batch = collectionNames.slice(i, i + batchSize);
      await Promise.all(batch.map(async (name) => {
        try {
          const client = getClientFromPool(name);
          await client.loadCollection();
        } catch (error) {
          console.warn(`Failed to preload collection ${name}:`, error.message);
        }
      }));
      
      if (i + batchSize < collectionNames.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error('Error in collection preloading:', error.message);
  }
};

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

const cleanupIdleConnections = (maxIdleTime = 30 * 60 * 1000) => {
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

const startConnectionCleanup = () => {
  setInterval(() => {
    cleanupIdleConnections();
  }, 10 * 60 * 1000);
};

export { 
  MilvusClientManager, 
  getClientFromPool, 
  preloadCollections, 
  getPoolStats, 
  startConnectionCleanup 
};