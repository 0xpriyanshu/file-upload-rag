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
  MILVUS_TOP_K: 2,
  MILVUS_RETURN_COUNT: 2,
  MILVUS_NLIST: 128,
  MAX_RETRIES: 10,
  NODE_RPC: {
    "0x61": {
      "RPC_URL": "https://bnb-testnet.g.alchemy.com/v2/lcYH1zqKsBwZXIhlIo6lhw0m5qt-3L8T",
      "USDT_ADDRESS": "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd"
    },
    "0x38": {
      "RPC_URL": "https://bsc-dataseed.bnbchain.org",
      "USDT_ADDRESS": "0x63b7e5aE00cc6053358fb9b97B361372FbA10a5e"
    },
    "0x2105":{
      "RPC_URL": "https://base.drpc.org",
      "USDT_ADDRESS": "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
    }
  },
  FRONTEND_URL: process.env.FRONTEND_URL,
  RETRY_DELAY: 2000, // in milliseconds
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_WEBHOOK_CONNECTED_ACCOUNTS: process.env.STRIPE_WEBHOOK_CONNECTED_ACCOUNTS,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  MODELSTOCREDITS: {
    'gpt-4o-mini': 1,
    'GPT-4o Mini': 1,
    'Llama 4 Maverick': 2,
    'llama-4-maverick': 2,
    'GPT-3.5 Turbo': 1,
    'Llama 3 Pro': 3,
    'Gemini Ultra': 4,
    'Claude 3 Opus': 5,
    'Mistral Large': 6,
    'Mixtral 8x22B': 7,
    'Grok-1': 8
  },
  PLANS: [
    {
      id: "1",
      name: "STARTER",
      price: 0,
      totalPrice: 0,
      totalDocSize: 512000,
      currency: "USD",
      credits: 100,
      recurrence: "monthly",
      agentLimit: 1,
      lookupKey: "starter",
      type:"STARTER",
      priceId: process.env.STRIPE_STARTER_MONTHLY,
      description: "per month",
      features: [
        '1 Hosted AI Agent',
        '100 Credits / Month',
        '500KB Data Upload per Agent',
        'Calendar',
        'Paid Bookings',
        'E-Commerce Support',
        'Stripe Payments',
        'Crypto Payments',
        'Analytics',
        'Live Support',
        'Embeddable Agent',
      ]
    },
    {
      id: "2",
      name: "SOLO",
      price: 29,
      totalPrice: 29,
      totalDocSize: 5242880,
      currency: "USD",
      credits: 1500,
      description: "per month",
      recurrence: "monthly",
      agentLimit: 3,
      lookupKey: "solo_monthly",
      type: "SOLO",
      priceId: process.env.STRIPE_SOLO_MONTHLY,
      features: [
        'everything in STARTER +',
        '1500 Credits / Month',
        '5MB Data Upload per Agent'
      ]
    },
    {
      id: "3",
      name: "PRO",
      price: 99,
      totalPrice: 99,
      totalDocSize: 52428800,
      currency: "USD",
      credits: 7500,
      description: "per month",
      recurrence: "monthly",
      agentLimit: 3,
      lookupKey: "pro_monthly",
      type: "PRO",
      priceId: process.env.STRIPE_PRO_MONTHLY,
      features: [
        'everything in SOLO +',
        '3 Agents',
        '7500 Credits / Month',
        '50MB Data Uploads per Agent',
        'Priority Support'
      ]
    },
    {
      id: "4",
      name: "BUSINESS",
      price: 499,
      totalPrice: 499,
      totalDocSize: 52428800,
      currency: "USD",
      credits: 50000,
      description: "per month",
      agentLimit: 9999,
      lookupKey: "business_monthly",
      type: "BUSINESS",
      priceId: process.env.STRIPE_BUSINESS_MONTHLY,
      recurrence: "monthly",
      features: [
        'everything in PRO +',
        'Unlimited Agents',
        '50000 Credits / Month',
        'Dedicated Support'
      ]
    },
    {
      id: "5",
      name: "STARTER",
      price: 0,
      totalPrice: 0,
      totalDocSize: 512000,
      currency: "USD",
      credits: 100,
      recurrence: "yearly",
      agentLimit: 1,
      lookupKey: "starter_yearly",
      type: "STARTER",
      priceId: process.env.STRIPE_STARTER_YEARLY,
      description: "per month",
      features: [
        '1 Hosted AI Agent',
        '100 Credits / Month',
        '500KB Data Upload per Agent',
        'Calendar',
        'Paid Bookings',
        'E-Commerce Support',
        'Stripe Payments',
        'Crypto Payments',
        'Analytics',
        'Live Support',
        'Embeddable Agent',
      ]
    },
    {
      id: "6",
      name: "SOLO(YEARLY)",
      price: 19,
      totalPrice: 228,
      totalDocSize: 5242880,
      description: "per month, $228 billed yearly",
      currency: "USD",
      credits: 18000,
      recurrence: "yearly",
      agentLimit: 1,
      lookupKey: "solo_yearly",
      type: "SOLO",
      priceId: process.env.STRIPE_SOLO_YEARLY,
      features: [
        'everything in STARTER +',
        '1500 Credits / Month',
        '5MB Data Upload per Agent'
      ]
    },
    {
      id: "7",
      name: "PRO(YEARLY)",
      price: 79,
      totalPrice: 948,
      totalDocSize: 52428800,
      description: "per month, $948 billed yearly",
      currency: "USD",
      credits: 90000,
      recurrence: "yearly",
      agentLimit: 3,
      lookupKey: "pro_yearly",
      type: "PRO",
      priceId: process.env.STRIPE_PRO_YEARLY,
      features: [
        'everything in SOLO +',
        '3 Agents',
        '7500 Credits / Month',
        '50MB Data Uploads per Agent',
        'Priority Support'
      ]
    },
    {
      id: "8",
      name: "BUSINESS(YEARLY)",
      price: 399,
      totalPrice: 4788,
      totalDocSize: 52428800,
      description: "per month, $4788 billed yearly",
      currency: "USD",
      credits: 600000,
      recurrence: "yearly",
      agentLimit: 9999,
      lookupKey: "business_yearly",
      type: "BUSINESS",
      priceId: process.env.STRIPE_BUSINESS_YEARLY,
      features: [
        'everything in PRO +',
        'Unlimited Agents',
        '50000 Credits / Month',
        'Dedicated Support'
      ]
    }
  ],
};