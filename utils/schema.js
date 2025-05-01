import { DataType } from '@zilliz/milvus2-sdk-node';
import config from '../config.js';
import { validateInput } from './utils.js';

/**
 * Creates a schema for a Milvus collection with document tracking.
 * @param {string} collectionName - The name of the collection.
 * @returns {Array} An array of field definitions for the schema.
 * @throws {Error} If the collection name is invalid.
 */
const createSchema = (collectionName) => {
  validateInput(collectionName, 'string', 'Collection name must be a non-empty string');

  return [
    {
      name: "id",
      description: "Unique identifier for each embedding",
      data_type: DataType.Int64,
      is_primary_key: true,
      autoID: true
    },
    {
      name: "vector",
      description: "Embedding vector for similarity search",
      data_type: DataType.FloatVector,
      dim: config.EMBEDDING_DIMENSION
    },
    {
      name: "text",
      description: "Text content of the document chunk",
      data_type: DataType.VarChar,
      type_params: {
        max_length: config.MAX_TEXT_LENGTH,
      },
    },
    {
      name: "documentId",
      description: "Identifier for the source document of this chunk",
      data_type: DataType.VarChar,
      type_params: {
        max_length: 128,
      },
    },
    {
      name: "timestamp",
      description: "Timestamp of when the embedding was created",
      data_type: DataType.Double,
    },
  ];
};

export { createSchema };