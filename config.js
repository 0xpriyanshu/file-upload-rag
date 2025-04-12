// config.js

require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 5000,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: "text-embedding-ada-002",
  MILVUS_ADDRESS: process.env.MILVUS_ADDRESS || "localhost:19530",
  EMBEDDING_DIMENSION: 1536,
  MAX_TEXT_LENGTH: 65535,
  CHUNK_SIZE: 3000,
  CHUNK_OVERLAP: 50,
  MILVUS_NPROBE: 10,
  MILVUS_TOP_K: 3,
  MILVUS_RETURN_COUNT: 2,
  MILVUS_NLIST: 128,
  MAX_RETRIES: 10,
  RETRY_DELAY: 2000, // in milliseconds
};