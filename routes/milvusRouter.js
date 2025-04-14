import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { processDocument, getDocumentEmbeddings, storeEmbeddingsIntoMilvus } from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";
import { validateInput, handleError } from "../utils/utils.js";

const router = express.Router();

router.post("/process-document", async (req, res) => {
  try {
    const { textContent } = req.body;
    validateInput(textContent, 'string', 'Invalid or empty text content');

    const { collectionName } = await processDocument(textContent);
    res.status(200).json({ message: 'Document processed successfully', collectionName });
  } catch (error) {
    const handledError = handleError("Error processing document", error);
    res.status(500).send(handledError.message);
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


export default router;