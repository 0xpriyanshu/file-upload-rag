// app.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { processDocument } = require("./documentProcessing");
const { queryFromDocument } = require("./ragSearch");
const config = require('./config');
const { validateInput, handleError, getCollectionNameByCustomId, listCollectionMappings } = require('./utils');

const app = express();
const PORT = config.PORT;

app.use(cors());
app.use(bodyParser.json());

app.post("/process-document", async (req, res) => {
  try {
    const { textContent, customId } = req.body;
    validateInput(textContent, 'string', 'Invalid or empty text content');

    const result = await processDocument(textContent, customId);
    res.status(200).json({
      message: 'Document processed successfully',
      collectionName: result.collectionName,
      customId: result.customId
    });
  } catch (error) {
    const handledError = handleError("Error processing document", error);
    res.status(500).send(handledError.message);
  }
});

app.post("/query-document", async (req, res) => {
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


app.get("/", async (req, res) => {
      res.status(200).send("hello WOrld");
  });

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});