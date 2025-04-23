
import express from "express";
import cors from 'cors';
import mongoose from "mongoose";
import dotenv from "dotenv";
import config from "./config.js";
import http from 'http';
import bodyParser from 'body-parser';
// import WebSocket from 'ws';
// import wsManager from './connections/websocketManager.js';
import './connections/redis.js';
import milvusRoutes from './routes/milvusRouter.js';
import clientRoutes from './routes/clientRouter.js';
import contentRoutes from './routes/contentRouter.js';
import appointmentRoutes from './routes/appointmentRouter.js';
import productRoutes from './routes/productRouter.js';
import userRoutes from './routes/userRouter.js';
import { updateUserOrder } from './controllers/productController.js';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

dotenv.config();

const app = express();
const server = http.createServer(app);
// const wss = new WebSocket.Server({ server })

// // WebSocket connection handler
// wss.on('connection', (ws) => {
//     wsManager.addClient(ws);
// });

// app.use(bodyParser.json());
// view engine setup
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

app.use(express.static("public"));
// app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

mongoose
  .connect(config.MONGODB_URL, {
    user: config.MONGODB_USER,
    pass: config.MONGODB_PASSWORD
  })
  .catch((err) => console.log(err));


app.use('/milvus', express.json(), milvusRoutes);
app.use('/client', express.json(), clientRoutes);
app.use('/content', express.json(), contentRoutes);
app.use('/appointment', express.json(), appointmentRoutes);
app.use('/product', express.json(), productRoutes);
app.use('/user', express.json(), userRoutes);

app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  let event = request.body;

  // if (!event.data.object.livemode) {
  //     response.send();
  //     return;
  // }
  const endpointSecret = config.STRIPE_WEBHOOK_SECRET;
  // Only verify the event if you have an endpoint secret defined.
  // Otherwise use the basic event deserialized with JSON.parse
  if (endpointSecret) {
    // Get the signature sent by Stripe
    const signature = request.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        signature,
        endpointSecret
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`, err.message);
      return response.sendStatus(400);
    }
  }

  // Handle the event
  switch (event.type) {
    // case 'account.updated':
    //   const account = event.data.object;
    //   console.log(event);
    //   // Check if the account has completed onboarding
    //   if (account.charges_enabled && account.payouts_enabled) {
    //     productController.updateStripeAccountIdCurrency(account.id);
    //   }
    //   break;
    case 'payment_intent.succeeded':
      console.log('Payment intent succeeded');
      // console.log(event);
      updateUserOrder(
        event.data.object.id,
        "succeeded",
        "COMPLETED"
      );
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment intent failed');
      // console.log(event);
      updateUserOrder(
        event.data.object.id,
        "failed",
        "FAILED"
      );
      break;
  }

  // Return a 200 response to acknowledge receipt of the event
  response.send();
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Content extraction endpoints available at: http://localhost:${PORT}/content/extract`);
  console.log(`YouTube OAuth setup available at: http://localhost:${PORT}/content/auth/google`);
  console.log(`Test YouTube transcript extraction at: http://localhost:${PORT}/content/test-youtube-transcript/[VIDEO_ID]`);
});

export default app;