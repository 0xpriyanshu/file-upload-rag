import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { signUpClient, addAgent, getAgents, getAgentDetails, deleteAgent, updateAgent, updateUserLogs, getChatLogs, getAgentChatLogs } from "../controllers/clientController.js";
import Client from "../models/ClientModel.js";


const router = express.Router();

router.post("/signupClient", async (req, res) => {
    try {
        const client = await signUpClient(req.body);
        res.status(200).send(client);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/addAgent", async (req, res) => {
    try {
        const response = await addAgent(req.body);
        res.status(200).send(response);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/agents/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const agents = await getAgents(clientId);
        res.status(200).send(agents); 
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/getAgentDetails/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const agent = await getAgentDetails(agentId);
        res.status(200).send(agent); 
    } catch (error) {
        res.status(400).send(error);
    }
});

router.put("/updateAgent/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const agent = await updateAgent(req.body, agentId);
        res.status(200).send(agent); 
    } catch (error) {
        res.status(400).send(error);
    }
});

router.delete("/deleteAgent/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const agent = await deleteAgent(agentId);
        res.status(200).send(agent); 
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateUserLogs", async (req, res) => {
    try {
        const { userId, sessionId, newUserLog, agentId } = req.body;
        const chatLogs = await updateUserLogs(userId, sessionId, newUserLog, agentId);
        res.status(200).send(chatLogs); 
    } catch (error) {
        res.status(400).send(error);
    }
}); 

router.get("/getChatLogs", async (req, res) => {
    try {
        const { userId, sessionId, agentId } = req.query;
        const chatLogs = await getChatLogs(userId, sessionId, agentId);
        res.status(200).send(chatLogs); 
    } catch (error) {
        res.status(400).send(error);
    }
}); 

router.get("/getAgentChatLogs/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const chatLogs = await getAgentChatLogs(agentId);
        res.status(200).send(chatLogs); 
    } catch (error) {
        res.status(400).send(error);
    }
}); 

export default router;