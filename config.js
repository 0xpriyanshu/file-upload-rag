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
      name: "FREE",
      price: 0,
      currency: "USD",
      credits: 100,
      recurrence: "monthly",
      description: [
        '1 Hosted AI Agent',
        'Standard Models',
        '100 Tokens / Month',
        '3 AI Actions per Agents',
        '500KB Data Uploads per Agent',
        'Calendar & Bookings',
        'Commerce Support',
        'Booking & Calendar Sync',
        'Digital Products',
        'Subscriptions',
        'Basic Analytics',
        '1 Team Members',
        'Email Support',
        'Embeddable Agent',
        'Agent Deletion on Inactivity (14 days)'
      ]
    },
    {
      id: "2",
      name: "SOLOPRENEUR",
      price: 29,
      currency: "USD",
      credits: 1000,
      recurrence: "monthly",
      description: [
        'everyting in FREE +',
        'Advanced Models',
        '1000 Tokens / Month',
        '5 AI Actions per Agents',
        '5MB Data Uploads per Agent',
        'Service & Downloads',
        'Digital Products (PDF, Video, ZIP)',
        'Email / Whatsapp Marketing',
      ]
    },
    {
      id: "3",
      name: "PRO",
      price: 99,
      currency: "USD",
      credits: 5000,
      recurrence: "monthly",
      description: [
        'everyting in SOLOPRENEUR +',
        '3 Agents',
        'Full Suite Models',
        '5000 Tokens / Month',
        '10 AI Actions per Agents',
        '50MB Data Uploads per Agent',
        'Subscriptions, Tipping',
        'Paid Bookings',
        'Digital Products (All formats)',
        'Basic Integrations (MCP)',
        'Advanced Analytics',
        'Upto 3 Team Members',
        'Priority Email Support'
      ]
    },
    {
      id: "4",
      name: "BUSINESS",
      price: 499,
      currency: "USD",
      credits: 20000,
      recurrence: "monthly",
      description: [
        'everyting in PRO +',
        'Unlimited Agents',
        '20000 Tokens / Month',
        '15 AI Actions per Agents',
        'All Commerce Support',
        'Advanced Agents Integrations (MCP)',
        '10 + Team Members',
        'Dedicated Email Support'
      ]
    },
    {
      id: "5",
      name: "SOLOPRENEUR(YEARLY)",
      price: 228,
      currency: "USD",
      credits: 12000,
      recurrence: "yearly",
      description: [
        'everyting in FREE +',
        'Advanced Models',
        '1000 Tokens / Month',
        '5 AI Actions per Agents',
        '5MB Data Uploads per Agent',
        'Service & Downloads',
        'Digital Products (PDF, Video, ZIP)',
        'Email / Whatsapp Marketing',
      ]
    },
    {
      id: "6",
      name: "PRO(YEARLY)",
      price: 948,
      currency: "USD",
      credits: 60000,
      recurrence: "yearly",
      description: [
        'everyting in SOLOPERNEUR +',
        '3 Agents',
        'Full Suite Models',
        '5000 Tokens / Month',
        '10 AI Actions per Agents',
        '50MB Data Uploads per Agent',
        'Subscriptions, Tipping',
        'Paid Bookings',
        'Digital Products (All formats)',
        'Basic Integrations (MCP)',
        'Advanced Analytics',
        'Upto 3 Team Members',
        'Priority Email Support'
      ]
    },
    {
      id: "7",
      name: "BUSINESS(YEARLY)",
      price: 4788,
      currency: "USD",
      credits: 240000,
      recurrence: "yearly",
      description: [
        'everyting in PRO +',
        'Unlimited Agents',
        '20000 Tokens / Month',
        '15 AI Actions per Agents',
        'All Commerce Support',
        'Advanced Agents Integrations (MCP)',
        '10 + Team Members',
        'Dedicated Email Support'
      ]
    }
  ],
};