import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { signUpClient, addAgent } from "../controllers/clientController.js";
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
        const client = await Client.findById(clientId);
        
        if (!client) {
            return res.status(404).json({
                error: true, 
                result: "Client not found"
            });
        }
        
        const agentsInfo = client.agents.map(agent => ({
            name: agent.name || agent.documentCollectionId,
            agentId: agent.agentId
        }));
        
        res.status(200).json({
            error: false,
            result: agentsInfo
        });
    } catch (error) {
        res.status(400).json({
            error: true,
            result: error.message
        });
    }
});


export default router;