import dotenv from 'dotenv';
dotenv.config();

export default {
  PORT: process.env.PORT || 5000,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: "text-embedding-ada-002",
  MILVUS_ADDRESS: process.env.MILVUS_ADDRESS || "localhost:19530",
  MONGODB_URL: process.env.MONGODB_URL,
  MONGODB_USER: process.env.MONGODB_USER,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD,
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: process.env.REDIS_PORT || 6379,
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
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  PLANS: [
    {
      id: "1",
      name: "Basic",
      price:20,
      currency: "USD",
      credits: 500,
      recurrence:"monthly",
      description:"500 credits per month"
    },
    {
      id: "2",
      name: "Pro",
      price: 200,
      currency: "USD",
      credits: 5000,
      recurrence: "monthly",
      description: "5000 credits per month"
    },
    {
      id: "3",
      name: "Enterprise",
      price: 1000,
      currency: "USD",
      credits: 50000,
      recurrence: "monthly",
      description: "50000 credits per month"
    },
    {
      id: "4",
      name: "Basic(yearly)",
      price: 200,
      currency: "USD",
      credits: 5000,
      recurrence: "yearly",
      description: "5000 credits per year"
    },
    {
      id: "5",
      name: "Pro(yearly)",
      price: 2000,
      currency: "USD",
      credits: 50000,
      recurrence: "yearly",
      description: "50000 credits per year"
    },
    {
      id: "6",
      name: "Enterprise(yearly)",
      price: 10000,
      currency: "USD",
      credits: 50000,
      recurrence: "yearly",
      description: "50000 credits per year"
    },
  ],
};