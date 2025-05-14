import express from "express";
import dotenv from "dotenv";
import { 
  processDocument, 
  deleteEntitiesFromCollection,
  addDocumentToCollection,
  updateDocumentInCollection 
} from "../utils/documentProcessing.js";
import { 
  queryFromDocument,
  getSystemStats,
  initializeRAGSystem,
  cacheAgentCollection,
  getCollectionNameForAgent
} from "../utils/ragSearch.js";
import { validateInput, checkAgentLimit } from "../utils/utils.js";
import { 
  createNewAgent, 
  updateAgent, 
  queryDocument,
  deleteAgent, 
  addDocumentToAgent, 
  removeDocumentFromAgent, 
  updateDocumentInAgent, 
  listAgentDocuments 
} from "../controllers/clientController.js";
import Agent from "../models/AgentModel.js";

dotenv.config();
const router = express.Router();

// Initialize the RAG system when the router is loaded
initializeRAGSystem();

// Helper function to fetch collection name for agent
const fetchCollectionNameForAgent = async (agentId) => {
  const agent = await Agent.findOne({ agentId }, { documentCollectionId: 1 });
  return agent ? agent.documentCollectionId : null;
};

// Create a new agent
router.post("/create-new-agent", async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(400).send({
        error: true,
        result: "Client ID is required"
      });
    }
    
    await checkAgentLimit(clientId);
    
    const response = await createNewAgent(req.body);
    
    // Cache the agent's collection name if successful
    if (!response.error && response.result && response.result.agentId && response.result.documentCollectionId) {
      cacheAgentCollection(response.result.agentId, response.result.documentCollectionId);
    }
    
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// Add document to agent
router.post("/add-document", async (req, res) => {
  try {
    const startTime = Date.now();
    const response = await addDocumentToAgent(req.body);
    
    // Cache agent collection if successful
    if (!response.error && req.body.agentId) {
      const agent = await Agent.findOne({ agentId: req.body.agentId });
      if (agent) {
        cacheAgentCollection(req.body.agentId, agent.documentCollectionId);
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`Document added in ${processingTime}ms`);
    
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// Remove document from agent
router.post("/remove-document", async (req, res) => {
  try {
    const response = await removeDocumentFromAgent(req.body);
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// Update document in agent
router.post("/update-document", async (req, res) => {
  try {
    const response = await updateDocumentInAgent(req.body);
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// List documents for agent
router.get("/list-documents/:agentId", async (req, res) => {
  try {
    const response = await listAgentDocuments(req.params.agentId);
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// Optimized document query endpoint using our enhanced RAG implementation
router.post("/query-document", async (req, res) => {
  const startTime = Date.now();
  try {
    const { agentId, query, excludeKiforDocs } = req.body;
    
    if (!agentId || !query) {
      return res.status(400).send({
        error: true,
        result: "Agent ID and query are required"
      });
    }
    
    // Get collection name from cache or database
    const collectionName = await getCollectionNameForAgent(agentId, fetchCollectionNameForAgent);
    
    if (!collectionName) {
      return res.status(404).send({
        error: true,
        result: "Agent not found or has no collection"
      });
    }
    
    const isPromptGeneration = query.includes("generate cues/prompts for the agent");
    
    // Use optimized query implementation
    const results = await queryFromDocument(
      collectionName, 
      query, 
      { includeKifor: !isPromptGeneration && !excludeKiforDocs }
    );
    
    const processingTime = Date.now() - startTime;
    console.log(`Query processed in ${processingTime}ms`);
    
    return res.status(200).send({
      error: false,
      result: results
    });
  } catch (error) {
    console.error("Error in query-document:", error);
    // Fall back to original implementation if optimized version fails
    try {
      const response = await queryDocument(req.body);
      res.status(response.error ? 400 : 200).send(response);
    } catch (fallbackError) {
      res.status(500).send({
        error: true,
        result: fallbackError.message,
        originalError: error.message
      });
    }
  }
});

// Delete collection
router.post("/delete-collection", async (req, res) => {
  try {
    const { collectionName } = req.body;
    
    if (!collectionName) {
      return res.status(400).send({
        error: true,
        result: "Collection name is required"
      });
    }
    
    await deleteEntitiesFromCollection(collectionName);
    
    res.status(200).send({
      error: false,
      result: `Collection ${collectionName} deleted successfully`
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// Update agent
router.post("/update-agent", async (req, res) => {
  try {
    const response = await updateAgent(req.body);
    
    // Update cache if agent collection name changes
    if (!response.error && req.body.agentId && response.result && response.result.collectionName) {
      cacheAgentCollection(req.body.agentId, response.result.collectionName);
    }
    
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

// System statistics endpoint for monitoring
router.get("/rag-stats", async (req, res) => {
  try {
    const stats = getSystemStats();
    res.status(200).send({
      error: false,
      result: stats
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

export default router;