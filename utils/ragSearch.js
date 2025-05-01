// ragSearch.js

import { OpenAIEmbeddings } from "@langchain/openai";
import { MilvusClientManager } from "./milvusUtils.js";
import { MetricType } from '@zilliz/milvus2-sdk-node';
import config from '../config.js';
import { validateInput, handleError } from './utils.js';

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
 */
 const searchEmbeddingInMilvus = async (milvusClient, embedding) => {
  validateInput(embedding, 'array', 'Invalid embedding format');

  try {
    await milvusClient.verifyCollection();
    return await milvusClient.searchEmbeddingFromStore(embedding);
  } catch (err) {
    throw handleError('Failed to search in Milvus', err);
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

export { queryFromDocument };