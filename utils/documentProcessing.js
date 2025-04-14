import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MilvusClientManager } from "./milvusUtils.js";
import { generateUniqueCollectionName, validateInput, handleError } from './utils.js';
import config from '../config.js';

/**
 * Generates embeddings for the given text content.
 * @param {string} textContent - The text content to generate embeddings for.
 * @returns {Promise<{embeddings: number[][], pagesContentOfDocs: string[]}>} The generated embeddings and corresponding text chunks.
 * @throws {Error} If there's an error during the embedding process.
 */
const getDocumentEmbeddings = async (textContent) => {
  validateInput(textContent, 'string', 'Invalid text content');

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.CHUNK_SIZE,
    chunkOverlap: config.CHUNK_OVERLAP
  });

  const rawSplitDocs = await splitter.splitText(textContent);
  const nonEmptyDocs = rawSplitDocs.filter(doc => doc.trim().length > 0);

  if (nonEmptyDocs.length === 0) {
    throw new Error("All docs are empty after splitting");
  }

  const embeddingsModel = new OpenAIEmbeddings({
    model: config.OPENAI_MODEL,
    apiKey: config.OPENAI_API_KEY
  });

  try {
    const embeddings = await embeddingsModel.embedDocuments(nonEmptyDocs);
    return { embeddings, pagesContentOfDocs: nonEmptyDocs };
  } catch (error) {
    throw handleError('Error generating embeddings', error);
  }
};

/**
 * Stores embeddings into Milvus.
 * @param {string} collectionName - The name of the collection to store embeddings in.
 * @param {number[][]} embeddings - The embeddings to store.
 * @param {string[]} pagesContentOfDocs - The corresponding text content for each embedding.
 * @throws {Error} If there's an error during the storage process.
 */
const storeEmbeddingsIntoMilvus = async (collectionName, embeddings, pagesContentOfDocs) => {
  try {
    const milvusClient = new MilvusClientManager(collectionName);
    await milvusClient.createCollection();

    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      timestamp: Date.now()
    }));

    await milvusClient.insertEmbeddingIntoStore(entities);
  } catch (error) {
    throw handleError("Error storing embeddings", error);
  }
};

/**
 * Deletes all entities from a collection while maintaining the collection structure.
 * @param {string} collectionName - The name of the collection to delete entities from.
 * @returns {Promise<boolean>} True if successful.
 * @throws {Error} If there's an error during the deletion process.
 */

 const deleteEntitiesFromCollection = async (collectionName) => {
  try {
    const milvusClient = new MilvusClientManager(collectionName);

    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      console.log(`Collection ${collectionName} does not exist, will create it`);
      return true; 
    }
    
    await milvusClient.client.dropCollection({
      collection_name: collectionName
    });
    
    console.log(`Collection ${collectionName} dropped and will be recreated with the same name`);

    return true;
  } catch (error) {
    throw handleError(`Error resetting collection ${collectionName}`, error);
  }
};

/**
 * Processes a document by generating embeddings and storing them in Milvus.
 * @param {string} textContent - The text content of the document to process.
 * @param {string} [existingCollectionName=null] - Optional existing collection name for updates.
 * @returns {Promise<{collectionName: string}>} The name of the collection where embeddings are stored.
 * @throws {Error} If there's an error during the document processing.
 */
 const processDocument = async (textContent, existingCollectionName = null) => {
  try {
    const collectionName = existingCollectionName || generateUniqueCollectionName();

    if (existingCollectionName) {
      await deleteEntitiesFromCollection(collectionName);
    }

    const { embeddings, pagesContentOfDocs } = await getDocumentEmbeddings(textContent);

    if (embeddings.length === 0 || pagesContentOfDocs.length === 0) {
      throw new Error('No valid documents or embeddings found');
    }

    await storeEmbeddingsIntoMilvus(collectionName, embeddings, pagesContentOfDocs);
    
    return { collectionName };
  } catch (error) {
    throw handleError("Error processing document", error);
  }
};

export { processDocument, getDocumentEmbeddings, storeEmbeddingsIntoMilvus, deleteEntitiesFromCollection };