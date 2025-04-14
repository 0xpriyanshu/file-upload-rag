
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


dotenv.config();

const app = express();
const server = http.createServer(app);
// const wss = new WebSocket.Server({ server })

// // WebSocket connection handler
// wss.on('connection', (ws) => {
//     wsManager.addClient(ws);
// });

app.use(bodyParser.json());
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


app.use('/milvus', milvusRoutes);
app.use('/client', clientRoutes);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;