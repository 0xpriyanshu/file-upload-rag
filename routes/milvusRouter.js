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
      const { agentId, newText, name } = req.body;
      
      validateInput(agentId, 'string', 'Invalid agent ID');
      
      if (!newText && !name) {
          return res.status(400).json({
              error: true,
              result: "At least one update parameter (newText or name) must be provided"
          });
      }

      const client = await Client.findOne({ "agents.agentId": agentId });
      
      if (!client) {
          return res.status(404).json({
              error: true,
              result: "Agent not found"
          });
      }

      const agentIndex = client.agents.findIndex(a => a.agentId === agentId);
      
      if (agentIndex === -1) {
          return res.status(404).json({
              error: true,
              result: "Agent not found"
          });
      }
      
      const agent = client.agents[agentIndex];
      const collectionName = agent.documentCollectionId;
      let updated = false;

      if (name && typeof name === 'string' && name.trim() !== '') {
          client.agents[agentIndex].name = name.trim();
          updated = true;
      }

      if (newText && typeof newText === 'string' && newText.trim() !== '') {
          await processDocument(newText, collectionName);
          updated = true;
      }
      
      if (updated && name) {
          await client.save();
      }
      
      res.status(200).json({ 
          error: false, 
          result: {
              message: "Agent updated successfully",
              agentId,
              collectionName,
              name: client.agents[agentIndex].name,
              textUpdated: Boolean(newText),
              nameUpdated: Boolean(name)
          }
      });
  } catch (error) {
      const handledError = handleError("Error updating agent", error);
      res.status(500).json({
          error: true,
          result: handledError.message
      });
  }
});


export default router;