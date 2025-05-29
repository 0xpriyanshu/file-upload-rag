import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MilvusClientManager } from "./milvusUtils.js";
import { generateUniqueCollectionName, validateInput, handleError } from './utils.js';
import config from '../config.js';
import { v4 as uuidv4 } from 'uuid';

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

  if (nonEmptyDocs[0].length > 8000) {
    console.warn(`Warning: Large chunk detected (${nonEmptyDocs[0].length} chars). Consider reducing chunk size.`);
  }

  const embeddingsModel = new OpenAIEmbeddings({
    model: config.OPENAI_MODEL,
    apiKey: config.OPENAI_API_KEY,
    timeout: 60000,
    maxRetries: 3
  });

  try {
    const batchSize = 20;
    let allEmbeddings = [];
    
    for (let i = 0; i < nonEmptyDocs.length; i += batchSize) {
      const batch = nonEmptyDocs.slice(i, i + batchSize);
      
      const batchEmbeddings = await embeddingsModel.embedDocuments(batch);
      
      for (let j = 0; j < batchEmbeddings.length; j++) {
        if (!Array.isArray(batchEmbeddings[j])) {
          console.error(`Invalid embedding at index ${j}: not an array`);
          throw new Error(`Invalid embedding format at index ${j}`);
        }
        
        if (batchEmbeddings[j].length !== 1536) {
          console.error(`Invalid embedding dimension at index ${j}: ${batchEmbeddings[j].length} (expected 1536)`);
          throw new Error(`Invalid embedding dimension at index ${j}: ${batchEmbeddings[j].length}`);
        }
      }
      
      allEmbeddings = [...allEmbeddings, ...batchEmbeddings];
      
      if (i + batchSize < nonEmptyDocs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (allEmbeddings.length !== nonEmptyDocs.length) {
      throw new Error(`Mismatch between embeddings (${allEmbeddings.length}) and documents (${nonEmptyDocs.length})`);
    }
    
    const documentIds = nonEmptyDocs.map(() => String(documentId));
    
    return { 
      embeddings: allEmbeddings, 
      pagesContentOfDocs: nonEmptyDocs, 
      documentIds 
    };
  } catch (error) {
    console.error('Error details:', error);
    throw handleError('Error generating embeddings', error);
  }
};

const storeEmbeddingsIntoMilvus = async (collectionName, embeddings, pagesContentOfDocs, documentIds) => {
  try {
    validateInput(documentIds, 'array', 'Document IDs must be a non-empty array');
    
    const milvusClient = new MilvusClientManager(collectionName);
    
    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      await milvusClient.createCollection();
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const verifyExists = await milvusClient.client.hasCollection({
        collection_name: collectionName
      });
      
      if (!verifyExists) {
        throw new Error(`Failed to create collection ${collectionName}`);
      }
    } else {
      await milvusClient.loadCollection();
    }

    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      documentId: documentIds[index],
      timestamp: Date.now()
    }));
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
    
    return insertResult;
  } catch (error) {
    console.error(`Error in storeEmbeddingsIntoMilvus: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    
    if (error.message && error.message.includes("collection not found")) {
      try {
        const milvusClient = new MilvusClientManager(collectionName);
        await milvusClient.createCollection();
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const entities = embeddings.map((embedding, index) => ({
          vector: embedding,
          text: pagesContentOfDocs[index],
          documentId: documentIds[index],
          timestamp: Date.now()
        }));
        
        const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
        
        return insertResult;
      } catch (retryError) {
        console.error(`Emergency collection creation failed: ${retryError.message}`);
        throw handleError("Error storing embeddings after retry", retryError);
      }
    }
    
    throw handleError("Error storing embeddings", error);
  }
};

const deleteDocumentFromCollection = async (collectionName, documentId) => {
  try {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    validateInput(documentId, 'string', 'Document ID must be a non-empty string');
    
    const milvusClient = new MilvusClientManager(collectionName);

    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      return true;
    }
    
    await milvusClient.client.delete({
      collection_name: collectionName,
      expr: `documentId == "${documentId}"`
    });
    
    return true;
  } catch (error) {
    throw handleError(`Error deleting document ${documentId} from collection ${collectionName}`, error);
  }
};

const deleteEntitiesFromCollection = async (collectionName) => {
  try {
    const milvusClient = new MilvusClientManager(collectionName);

    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      return true;
    }
    
    await milvusClient.client.dropCollection({
      collection_name: collectionName
    });

    return true;
  } catch (error) {
    throw handleError(`Error resetting collection ${collectionName}`, error);
  }
};

const addDocumentToCollection = async (textContent, collectionName, documentId = null, documentSize = null) => {
  try {
    validateInput(textContent, 'string', 'Text content must be a non-empty string');
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    
    const docId = documentId || uuidv4();
    const docSize = documentSize || Buffer.byteLength(textContent, 'utf8');

    const { embeddings, pagesContentOfDocs, documentIds } = await getDocumentEmbeddings(textContent, docId);

    if (embeddings.length === 0 || pagesContentOfDocs.length === 0) {
      throw new Error('No valid documents or embeddings found');
    }

    await storeEmbeddingsIntoMilvus(collectionName, embeddings, pagesContentOfDocs, documentIds);
    
    return { documentId: docId, size: docSize };
  } catch (error) {
    throw handleError("Error adding document to collection", error);
  }
};

const updateDocumentInCollection = async (textContent, collectionName, documentId, documentSize = null) => {
  try {
    validateInput(textContent, 'string', 'Text content must be a non-empty string');
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    validateInput(documentId, 'string', 'Document ID must be a non-empty string');
    
    await deleteDocumentFromCollection(collectionName, documentId);
    
    return await addDocumentToCollection(textContent, collectionName, documentId, documentSize);
  } catch (error) {
    throw handleError("Error updating document in collection", error);
  }
};

const processDocument = async (textContent, existingCollectionName = null) => {
  try {
    const collectionName = existingCollectionName || generateUniqueCollectionName();
    
    if (existingCollectionName) {
      await deleteEntitiesFromCollection(collectionName);
    }
    
    const documentId = uuidv4();
    
    await addDocumentToCollection(textContent, collectionName, documentId);
    
    return { collectionName, documentId };
  } catch (error) {
    throw handleError("Error processing document", error);
  }
};

const addDocumentToExistingCollection = async (textContent, collectionName, documentId, documentSize) => {
  try {
    const { embeddings, pagesContentOfDocs, documentIds } = await getDocumentEmbeddings(textContent, documentId);

    const milvusClient = new MilvusClientManager(collectionName);
    
    await milvusClient.loadCollection();
    
    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      documentId: documentIds[index],
      timestamp: Date.now()
    }));
    
    const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
    
    return { 
      documentId, 
      size: documentSize,
      insertResult
    };
  } catch (error) {
    console.error(`Error in addDocumentToExistingCollection: ${error.message}`);
    throw error;
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