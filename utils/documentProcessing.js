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

  console.log(`Processing document text of length ${textContent.length} with ID ${documentId}`);
  
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.CHUNK_SIZE,
    chunkOverlap: config.CHUNK_OVERLAP
  });

  console.log(`Splitting text with chunk size ${config.CHUNK_SIZE} and overlap ${config.CHUNK_OVERLAP}`);
  const rawSplitDocs = await splitter.splitText(textContent);
  const nonEmptyDocs = rawSplitDocs.filter(doc => doc.trim().length > 0);

  console.log(`Split into ${nonEmptyDocs.length} non-empty chunks`);

  if (nonEmptyDocs.length === 0) {
    throw new Error("All docs are empty after splitting");
  }

  // Validate the first chunk to make sure it's not too large
  if (nonEmptyDocs[0].length > 8000) {
    console.warn(`Warning: Large chunk detected (${nonEmptyDocs[0].length} chars). Consider reducing chunk size.`);
  }

  const embeddingsModel = new OpenAIEmbeddings({
    model: config.OPENAI_MODEL,
    apiKey: config.OPENAI_API_KEY,
    timeout: 60000,  // Increase timeout to 60 seconds
    maxRetries: 3    // Add more retries
  });

  try {
    console.log(`Generating embeddings for ${nonEmptyDocs.length} chunks...`);
    
    // Process in smaller batches to avoid API limits
    const batchSize = 20;
    let allEmbeddings = [];
    
    for (let i = 0; i < nonEmptyDocs.length; i += batchSize) {
      const batch = nonEmptyDocs.slice(i, i + batchSize);
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(nonEmptyDocs.length/batchSize)}`);
      
      const batchEmbeddings = await embeddingsModel.embedDocuments(batch);
      
      // Verify embeddings are valid arrays with correct dimensions
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
      
      // Add a small delay between batches
      if (i + batchSize < nonEmptyDocs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`Successfully generated ${allEmbeddings.length} embeddings`);
    
    // Make sure we have the same number of embeddings as documents
    if (allEmbeddings.length !== nonEmptyDocs.length) {
      throw new Error(`Mismatch between embeddings (${allEmbeddings.length}) and documents (${nonEmptyDocs.length})`);
    }
    
    // Make sure all document IDs are strings
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
    
    const exists = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!exists) {
      console.log(`Collection ${collectionName} doesn't exist, creating it...`);
      await milvusClient.createCollection();
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const verifyExists = await milvusClient.client.hasCollection({
        collection_name: collectionName
      });
      
      if (!verifyExists) {
        throw new Error(`Failed to create collection ${collectionName}`);
      }
      
      console.log(`Collection ${collectionName} created and verified`);
    } else {
      console.log(`Collection ${collectionName} exists, loading it...`);
      await milvusClient.loadCollection();
    }

    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      documentId: documentIds[index],
      timestamp: Date.now()
    }));

    console.log(`Inserting ${entities.length} entities into collection ${collectionName}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
    console.log(`Entities inserted successfully`);
    
    return insertResult;
  } catch (error) {
    console.error(`Error in storeEmbeddingsIntoMilvus: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    
    if (error.message && error.message.includes("collection not found")) {
      try {
        console.log(`Trying emergency collection creation for ${collectionName}`);
        const milvusClient = new MilvusClientManager(collectionName);
        await milvusClient.createCollection();
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        console.log(`Retrying insertion after emergency collection creation`);
        const entities = embeddings.map((embedding, index) => ({
          vector: embedding,
          text: pagesContentOfDocs[index],
          documentId: documentIds[index],
          timestamp: Date.now()
        }));
        
        const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
        console.log(`Entities inserted successfully after retry`);
        
        return insertResult;
      } catch (retryError) {
        console.error(`Emergency collection creation failed: ${retryError.message}`);
        throw handleError("Error storing embeddings after retry", retryError);
      }
    }
    
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
 * @param {number} [documentSize=null] - Optional document size in bytes.
 * @returns {Promise<{documentId: string, size: number}>} The ID and size of the added document.
 * @throws {Error} If there's an error during the document processing.
 */
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

/**
 * Adds a Kifor.ai default document to an agent's collection
 * @param {string} collectionName - The name of the collection to add the document to
 * @returns {Promise<void>} No return value needed since this document isn't tracked in the Agent model
 * @throws {Error} If there's an error during the document processing
 */

 const addKiforDefaultDocument = async (collectionName) => {
  try {
    validateInput(collectionName, 'string', 'Collection name must be a non-empty string');
    
    const milvusClient = new MilvusClientManager(collectionName);
    const hasCollection = await milvusClient.client.hasCollection({
      collection_name: collectionName
    });
    
    if (!hasCollection) {
      console.log(`Collection ${collectionName} doesn't exist yet. Creating it first...`);
      await milvusClient.createCollection();
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const verifyExists = await milvusClient.client.hasCollection({
        collection_name: collectionName
      });
      
      if (!verifyExists) {
        throw new Error(`Failed to create collection ${collectionName} for Kifor document`);
      }
      
      console.log(`Collection ${collectionName} created and verified for Kifor document`);
    }
    
    const kiforContent = `# Kifor.ai Platform Overview

## About Kifor.ai
Kifor.ai is a comprehensive AI platform that enables businesses to create intelligent chatbots, knowledge bases, and automated systems. Our platform allows you to ingest documents, build conversational agents, publish products, manage bookings, and more—all through intuitive chatbot interfaces.

## Key Features

### Document Ingestion & Knowledge Management
- Upload and process various document formats (PDF, DOCX, TXT)
- Automatic content extraction and semantic indexing
- Smart chunking and embedding generation for efficient retrieval
- Real-time document updates and version management

### AI Chatbot Creation
- No-code chatbot builder with customizable templates
- Advanced natural language understanding capabilities
- Personality customization for brand alignment
- Multi-language support for global audiences

### E-commerce & Product Management
- Create and showcase products through conversational interfaces
- Manage inventory and product details
- Process orders and handle customer inquiries
- Generate product recommendations based on user preferences

### Appointment & Booking System
- Schedule and manage appointments through chatbots
- Automated reminders and notifications
- Calendar synchronization
- Booking confirmation and management

### Integration Capabilities
- Connect to existing CRM and ERP systems
- API integration with third-party services
- Customizable webhooks for event processing
- Social media platform integration

## Use Cases
- Customer support automation
- Sales assistance and lead qualification
- Knowledge base for internal teams
- Product showcasing and e-commerce
- Appointment scheduling and service booking
- Document management and information retrieval

## Benefits of Using Kifor.ai
- Reduce operational costs through automation
- Improve customer engagement with 24/7 availability
- Streamline document management and knowledge sharing
- Enhance user experience with conversational interfaces
- Generate insights from customer interactions
- Scale your business operations efficiently

For more information, visit Kifor.ai or contact our support team.`;
    
    const kiforDocId = 'kifordoc_' + uuidv4();
    
    const contentSize = Buffer.byteLength(kiforContent, 'utf8');
    
    const { embeddings, pagesContentOfDocs, documentIds } = await getDocumentEmbeddings(kiforContent, kiforDocId);
    
    await milvusClient.loadCollection();
    
    const entities = embeddings.map((embedding, index) => ({
      vector: embedding,
      text: pagesContentOfDocs[index],
      documentId: documentIds[index],
      timestamp: Date.now()
    }));
    
    console.log(`Inserting ${entities.length} Kifor document entities into collection ${collectionName}`);
    const insertResult = await milvusClient.insertEmbeddingIntoStore(entities);
    
    console.log(`Kifor.ai default document added to collection ${collectionName}`);
    return { 
      documentId: kiforDocId, 
      size: contentSize,
      insertResult
    };
  } catch (error) {
    console.error('Error adding Kifor.ai default document:', error);
    throw error; 
  }
};

/**
 * Adds a document to an existing collection without recreating it
 * @param {string} textContent - The text content of the document
 * @param {string} collectionName - The name of the collection
 * @param {string} documentId - The document ID
 * @param {number} documentSize - The size of the document in bytes
 * @returns {Promise<Object>} The result of the operation
 */
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
  updateDocumentInCollection,
  addKiforDefaultDocument
};