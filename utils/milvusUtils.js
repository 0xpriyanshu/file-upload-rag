import { MilvusClient, IndexType, MetricType } from '@zilliz/milvus2-sdk-node';
import { createSchema } from './schema.js';
import config from '../config.js';
import { validateInput, handleError } from './utils.js';

class MilvusClientManager {
  /**
   * Creates a new MilvusClientManager instance.
   * @param {string} collectionName - The name of the collection to manage.
   */
  constructor(collectionName) {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    this.client = new MilvusClient(config.MILVUS_ADDRESS);
    this.collectionName = collectionName;
  }

  /**
   * Creates a new collection in Milvus.
   * @throws {Error} If there's an error creating the collection or index.
   */
  async createCollection() {
    try {
      const schema = createSchema(this.collectionName);
      const collectionSchema = {
        collection_name: this.collectionName,
        fields: schema,
      };
      await this.client.createCollection(collectionSchema);
      await this.waitForCollectionReady();
      await this.createIndexes();
      await this.loadCollection();
    } catch (error) {
      throw handleError('Error creating collection or index', error);
    }
  }

  /**
   * Waits for the collection to be ready.
   * @throws {Error} If the collection is not ready after maximum retries.
   */
  async waitForCollectionReady() {
    let retries = config.MAX_RETRIES;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
      const collectionInfo = await this.client.describeCollection({ collection_name: this.collectionName });
      if (collectionInfo && collectionInfo.status && collectionInfo.status.error_code === 'Success') {
        return;
      }
      retries -= 1;
    }
    throw new Error(`Collection ${this.collectionName} is not ready after ${config.MAX_RETRIES} retries.`);
  }

  /**
   * Creates indexes for the collection.
   * @throws {Error} If there's an error creating the index.
   */
  async createIndexes() {
    const indexParams = {
      collection_name: this.collectionName,
      field_name: 'vector',
      index_name: 'vector_index',
      extra_params: {
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: JSON.stringify({ nlist: config.MILVUS_NLIST }),
      },
    };

    await this.client.createIndex(indexParams);
    await this.waitForIndexReady();
  }

  /**
   * Waits for the index to be ready.
   * @throws {Error} If the index is not ready after maximum retries.
   */
  async waitForIndexReady() {
    let retries = config.MAX_RETRIES;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
      const indexInfo = await this.client.describeIndex({
        collection_name: this.collectionName,
        field_name: 'vector'
      });
      if (indexInfo.index_descriptions.length > 0) {
        return;
      }
      retries -= 1;
    }
    throw new Error('Index creation validation failed.');
  }

  /**
   * Loads the collection into memory.
   * @throws {Error} If there's an error loading the collection.
   */
  async loadCollection() {
    await this.client.loadCollection({ collection_name: this.collectionName });
    await this.waitForCollectionLoaded();
  }

  /**
   * Waits for the collection to be loaded.
   * @throws {Error} If the collection is not loaded after maximum retries.
   */
  async waitForCollectionLoaded() {
    let retries = config.MAX_RETRIES;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
      const collectionStatus = await this.client.describeCollection({ collection_name: this.collectionName });
      if (collectionStatus && collectionStatus.status && collectionStatus.status.error_code === 'Success') {
        return;
      }
      retries -= 1;
    }
    throw new Error('Collection loading validation failed.');
  }

  /**
   * Inserts embeddings into the collection.
   * @param {Array} embeddings - The embeddings to insert.
   * @throws {Error} If there's an error inserting the embeddings.
   */
  async insertEmbeddingIntoStore(embeddings) {
    validateInput(embeddings, 'array', 'Embeddings must be a non-empty array');
    try {
      const fieldsData = embeddings.map(e => ({
        vector: e.vector,
        text: e.text,
        documentId: e.documentId,
        timestamp: e.timestamp,
      }));
      await this.client.insert({
        collection_name: this.collectionName,
        fields_data: fieldsData,
      });
    } catch (error) {
      throw handleError('Error inserting embeddings', error);
    }
  }

  /**
   * Lists all collections in Milvus.
   * @returns {Promise<Array>} An array of collection information.
   * @throws {Error} If there's an error listing the collections.
   */
  async listCollections() {
    try {
      const result = await this.client.listCollections();
      if (result && result.collection_names) {
        return result.collection_names.map(name => ({
          name,
          id: result.collection_ids[result.collection_names.indexOf(name)],
          timestamp: result.created_utc_timestamps[result.collection_names.indexOf(name)],
        }));
      } else {
        throw new Error('Collections listing is not in the expected format');
      }
    } catch (error) {
      throw handleError('Error listing collections', error);
    }
  }

  /**
   * Verifies the existence of the collection and creates it if it doesn't exist.
   * @throws {Error} If there's an error verifying or creating the collection.
   */
  async verifyCollection() {
    try {
      const collections = await this.listCollections();
      let collection = collections.find(c => c.name === this.collectionName);

      if (!collection) {
        await this.createCollection();
        const updatedCollections = await this.listCollections();
        collection = updatedCollections.find(c => c.name === this.collectionName);

        if (!collection) {
          throw new Error(`Collection ${this.collectionName} not found after creation.`);
        }
      }
    } catch (error) {
      throw handleError('Error verifying collection', error);
    }
  }

  /**
   * Searches for similar embeddings in the collection.
   * @param {number[]} embedding - The embedding to search for.
   * @returns {Promise<Array>} The search results.
   * @throws {Error} If there's an error during the search process.
   */
  async searchEmbeddingFromStore(embedding) {
    validateInput(embedding, 'array', 'Embedding must be a non-empty array');
    try {
      const searchParams = {
        collection_name: this.collectionName,
        metric_type: MetricType.COSINE,
        params: JSON.stringify({
          nprobe: config.MILVUS_NPROBE,
        }),
        vectors: [embedding],
        top_k: config.MILVUS_TOP_K,
      };

      const results = await this.client.search(searchParams);
      if (results && Array.isArray(results.results)) {
        return results.results;
      } else {
        throw new Error('Unexpected search results format');
      }
    } catch (error) {
      throw handleError('Error searching embedding in Milvus', error);
    }
  }
}

export { MilvusClientManager };