// ragSearch.js

const { OpenAIEmbeddings } = require("@langchain/openai");
const { MilvusClientManager } = require("./milvusUtils");
const { MetricType } = require('@zilliz/milvus2-sdk-node');
const config = require('./config');
const { validateInput, handleError } = require('./utils');

/**
 * Creates embeddings for a given query using OpenAI's API.
 * @param {string} query - The query to create embeddings for.
 * @returns {Promise<number[]>} The embedding vector.
 * @throws {Error} If the query is invalid or if there's an error creating embeddings.
 */
const createQueryEmbeddings = async (query) => {
  validateInput(query, 'string', 'Query must be a non-empty string');

  const embeddingsModel = new OpenAIEmbeddings({
    model: config.OPENAI_MODEL,
    apiKey: config.OPENAI_API_KEY
  });

  try {
    const embeddings = await embeddingsModel.embedDocuments([query]);
    return embeddings[0];
  } catch (error) {
    throw handleError('Error creating embeddings', error);
  }
};

/**
 * Searches for similar embeddings in Milvus.
 * @param {MilvusClientManager} milvusClient - The Milvus client instance.
 * @param {number[]} embedding - The embedding vector to search for.
 * @returns {Promise<Array>} The search results.
 * @throws {Error} If there's an error during the search process.
 */
const searchEmbeddingInMilvus = async (milvusClient, embedding) => {
  validateInput(embedding, 'array', 'Invalid embedding format');

  try {
    const searchParams = {
      collection_name: milvusClient.collectionName,
      metric_type: MetricType.COSINE,
      params: { nprobe: config.MILVUS_NPROBE },
      vectors: [embedding],
      top_k: config.MILVUS_TOP_K,
    };

    const results = await milvusClient.client.search(searchParams);

    if (results.status.error_code !== 'Success' || !Array.isArray(results.results) || results.results.length === 0) {
      throw new Error('No results found or unexpected results format');
    }

    return results.results
      .slice(0, config.MILVUS_RETURN_COUNT)
      .map(result => ({
        score: result.score,
        id: result.id,
        text: result.text || 'No text available'
      }));
  } catch (error) {
    throw handleError('Failed to search in Milvus', error);
  }
};

/**
 * Queries a document collection based on input.
 * @param {string} collectionName - The name of the collection to query.
 * @param {string} input - The input query.
 * @returns {Promise<string[]>} An array of relevant text chunks.
 * @throws {Error} If there's an error during the query process.
 */
const queryFromDocument = async (collectionName, input) => {
  validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
  validateInput(input, 'string', 'Input must be a non-empty string');

  const milvusClient = new MilvusClientManager(collectionName);

  try {
    const embedding = await createQueryEmbeddings(input);
    const closestDocs = await searchEmbeddingInMilvus(milvusClient, embedding);

    return closestDocs.map(doc => doc.text || 'No text available');
  } catch (error) {
    throw handleError('Error querying from document', error);
  }
};

module.exports = { queryFromDocument };