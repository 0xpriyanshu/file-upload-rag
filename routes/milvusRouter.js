import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { processDocument, getDocumentEmbeddings, storeEmbeddingsIntoMilvus, deleteEntitiesFromCollection } from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";
import { validateInput, handleError } from "../utils/utils.js";
import { createNewAgent, updateAgent, queryDocument, deleteAgent, addDocumentToAgent, removeDocumentFromAgent, updateDocumentInAgent, listAgentDocuments } from "../controllers/clientController.js";
import Client from "../models/ClientModel.js";

const router = express.Router();

router.post("/create-new-agent", async (req, res) => {
  try {
      const response = await createNewAgent(req.body);
      res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
      res.status(500).send({
          error: true,
          result: error.message
      });
  }
});

router.post("/add-document", async (req, res) => {
  try {
      const response = await addDocumentToAgent(req.body);
      res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
      res.status(500).send({
          error: true,
          result: error.message
      });
  }
});

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

router.post("/query-document", async (req, res) => {
  try {
    const response = await queryDocument(req.body);
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});

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

router.post("/update-agent", async (req, res) => {
  try {
    const response = await updateAgent(req.body);
    res.status(response.error ? 400 : 200).send(response);
  } catch (error) {
    res.status(500).send({
      error: true,
      result: error.message
    });
  }
});


export default router;