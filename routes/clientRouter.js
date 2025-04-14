import express from "express";
import dotenv from "dotenv";
dotenv.config();
import { signUpClient, addAgent, getAgents } from "../controllers/clientController.js";
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


export default router;