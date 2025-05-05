import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MilvusClientManager } from "./milvusUtils.js";
import { generateUniqueCollectionName, validateInput, handleError } from './utils.js';
import config from '../config.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generates embeddings for the given text content with a document identifier.
 * @param {string} textContent - The text content to generate embeddings for.
 * @param {string} documentId - Unique identifier for this document.
 * @returns {Promise<{embeddings: number[][], pagesContentOfDocs: string[], documentIds: string[]}>}
 * @throws {Error} If there's an error during the embedding process.
 */
const getDocumentEmbeddings = async (textContent, documentId) => {
  validateInput(textContent, 'string', 'Invalid text content');
  validateInput(documentId, 'string', 'Invalid document ID');

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
    const documentIds = nonEmptyDocs.map(() => documentId);
    return { embeddings, pagesContentOfDocs: nonEmptyDocs, documentIds };
  } catch (error) {
    throw handleError('Error generating embeddings', error);
  }
};

/**
 * Stores embeddings into Milvus with document tracking.
 * @param {string} collectionName - The name of the collection to store embeddings in.
 * @param {number[][]} embeddings - The embeddings to store.
 * @param {string[]} pagesContentOfDocs - The corresponding text content for each embedding.
 * @param {string[]} documentIds - The document IDs for each chunk.
 * @throws {Error} If there's an error during the storage process.
 */
const storeEmbeddingsIntoMilvus = async (collectionName, embeddings, pagesContentOfDocs, documentIds) => {
  try {
    validateInput(documentIds, 'array', 'Document IDs must be a non-empty array');
    
    const milvusClient = new MilvusClientManager(collectionName);
    
    try {
      const exists = await milvusClient.client.hasCollection({
        collection_name: collectionName
      });
      
      console.log(`Collection ${collectionName} exists check result: ${exists}`);
      
      if (!exists) {
        console.log(`Creating collection: ${collectionName}`);
        await milvusClient.createCollection();
        console.log(`Collection ${collectionName} created successfully`);
      } else {
        await milvusClient.loadCollection();
        console.log(`Collection ${collectionName} loaded successfully`);
      }
    } catch (collectionError) {
      console.error(`Error checking or creating collection: ${collectionError.message}`);
      try {
        await milvusClient.createCollection();
        console.log(`Collection ${collectionName} created after error`);
      } catch (createError) {
        throw new Error(`Failed to create collection: ${createError.message}`);
      }
    }

    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      documentId: documentIds[index],
      timestamp: Date.now()
    }));

    console.log(`Inserting ${entities.length} entities into collection ${collectionName}`);
    await milvusClient.insertEmbeddingIntoStore(entities);
    console.log(`Entities inserted successfully`);
  } catch (error) {
    console.error(`Error in storeEmbeddingsIntoMilvus: ${error.message}`);
    throw handleError("Error storing embeddings", error);
  }
};

/**
 * Deletes all entries from a specific document within a collection.
 * @param {string} collectionName - The name of the collection.
 * @param {string} documentId - The ID of the document to delete.
 * @returns {Promise<boolean>} True if successful.
 * @throws {Error} If there's an error during the deletion process.
 */
const deleteDocumentFromCollection = async (collectionName, documentId) => {
  try {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    validateInput(documentId, 'string', 'Document ID must be a non-empty string');
    
    const milvusClient = new MilvusClientManager(collectionName);

    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      console.log(`Collection ${collectionName} does not exist, nothing to delete`);
      return true;
    }
    
    await milvusClient.client.delete({
      collection_name: collectionName,
      expr: `documentId == "${documentId}"`
    });
    
    console.log(`Document ${documentId} deleted from collection ${collectionName}`);
    return true;
  } catch (error) {
    throw handleError(`Error deleting document ${documentId} from collection ${collectionName}`, error);
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
 * Adds a document to an existing collection with a unique document ID.
 * @param {string} textContent - The text content of the document to process.
 * @param {string} collectionName - The name of the collection to add the document to.
 * @param {string} [documentId=null] - Optional document ID. If not provided, a new UUID will be generated.
 * @returns {Promise<{documentId: string}>} The ID of the added document.
 * @throws {Error} If there's an error during the document processing.
 */
const addDocumentToCollection = async (textContent, collectionName, documentId = null) => {
  try {
    validateInput(textContent, 'string', 'Text content must be a non-empty string');
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    
    // Generate a document ID if not provided
    const docId = documentId || uuidv4();
    
    const { embeddings, pagesContentOfDocs, documentIds } = await getDocumentEmbeddings(textContent, docId);

    if (embeddings.length === 0 || pagesContentOfDocs.length === 0) {
      throw new Error('No valid documents or embeddings found');
    }

    await storeEmbeddingsIntoMilvus(collectionName, embeddings, pagesContentOfDocs, documentIds);
    
    return { documentId: docId };
  } catch (error) {
    throw handleError("Error adding document to collection", error);
  }
};

/**
 * Updates a document in a collection by removing the old document and adding the new one.
 * @param {string} textContent - The new text content of the document.
 * @param {string} collectionName - The name of the collection.
 * @param {string} documentId - The ID of the document to update.
 * @returns {Promise<{documentId: string}>} The ID of the updated document.
 * @throws {Error} If there's an error during the document update.
 */
const updateDocumentInCollection = async (textContent, collectionName, documentId) => {
  try {
    validateInput(textContent, 'string', 'Text content must be a non-empty string');
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    validateInput(documentId, 'string', 'Document ID must be a non-empty string');
    
    // Delete the existing document
    await deleteDocumentFromCollection(collectionName, documentId);
    
    // Add the updated document with the same ID
    return await addDocumentToCollection(textContent, collectionName, documentId);
  } catch (error) {
    throw handleError("Error updating document in collection", error);
  }
};

/**
 * Processes a document by generating embeddings and storing them in Milvus.
 * This function maintains backward compatibility with the original implementation.
 * 
 * @param {string} textContent - The text content of the document to process.
 * @param {string} [existingCollectionName=null] - Optional existing collection name for updates.
 * @returns {Promise<{collectionName: string}>} The name of the collection where embeddings are stored.
 * @throws {Error} If there's an error during the document processing.
 */
const processDocument = async (textContent, existingCollectionName = null) => {
  try {
    const collectionName = existingCollectionName || generateUniqueCollectionName();
    
    if (existingCollectionName) {
      // For backward compatibility, clear the collection if specified
      await deleteEntitiesFromCollection(collectionName);
    }
    
    // Generate a document ID
    const documentId = uuidv4();
    
    // Add the document to the collection
    await addDocumentToCollection(textContent, collectionName, documentId);
    
    return { collectionName, documentId };
  } catch (error) {
    throw handleError("Error processing document", error);
  }
};

export { 
  processDocument, 
  getDocumentEmbeddings, 
  storeEmbeddingsIntoMilvus, 
  deleteEntitiesFromCollection, 
  addDocumentToCollection, 
  deleteDocumentFromCollection, 
  updateDocumentInCollection 
};