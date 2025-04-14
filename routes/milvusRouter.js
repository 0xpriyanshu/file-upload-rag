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
      const response = await createNewAgent(req.body);
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
      const response = await updateAgent(req.body);
      res.status(200).send(response);
  } catch (error) {
      res.status(400).send(error);
  }
});


export default router;