import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { processDocument, getDocumentEmbeddings, storeEmbeddingsIntoMilvus } from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";
import { validateInput, handleError } from "../utils/utils.js";
import { addAgent } from "../controllers/clientController.js";
import Client from "../models/ClientModel.js";

const router = express.Router();

router.post("/create-new-agent", async (req, res) => {
  try {
    const { textContent, clientId, name } = req.body;
    validateInput(textContent, 'string', 'Invalid or empty text content');
    validateInput(clientId, 'string', 'Invalid client ID');
    validateInput(name, 'string', 'Invalid or empty agent name');
    
    const { collectionName } = await processDocument(textContent);
    
    const agentResponse = await addAgent({
      body: {
        clientId,
        documentCollectionId: collectionName,
        name: name
      }
    });
    
    console.log('Agent response:', JSON.stringify(agentResponse, null, 2));

    res.status(200).json({
      error: false,
      result: {
        message: 'Document processed and agent created successfully',
        collectionName,
        agentId: agentResponse.result.agents[agentResponse.result.agents.length - 1].agentId,
        clientId,
        name
      }
    });
  } catch (error) {
    const handledError = handleError("Error processing document", error);
    res.status(500).json({
      error: true,
      result: handledError.message
    });
  }
});

router.post("/query-document", async (req, res) => {
  try {
    const { collectionName, query } = req.body;
    validateInput(query, 'string', 'Invalid or empty query');
    validateInput(collectionName, 'string', 'Invalid or empty collection name');

    const response = await queryFromDocument(collectionName, query);
    res.status(200).json({ response });
  } catch (error) {
    const handledError = handleError("Error querying document", error);
    res.status(500).send(handledError.message);
  }
});

router.post("/update-agent", async (req, res) => {
  try {
      const { agentId, newText } = req.body;
      validateInput(agentId, 'string', 'Invalid agent ID');
      validateInput(newText, 'string', 'Invalid or empty text');
      
      const client = await Client.findOne({ "agents.agentId": agentId });
      
      if (!client) {
          return res.status(404).json({
              error: true,
              message: "Agent not found"
          });
      }
      const agent = client.agents.find(a => a.agentId === agentId);
      
      if (!agent) {
          return res.status(404).json({
              error: true,
              message: "Agent not found"
          });
      }
      
      const collectionName = agent.documentCollectionId;

      await processDocument(newText, collectionName);
      
      res.status(200).json({ 
          error: false, 
          message: "Agent document updated successfully",
          agentId,
          collectionName
      });
  } catch (error) {
      const handledError = handleError("Error updating agent", error);
      res.status(500).send(handledError.message);
  }
});


export default router;