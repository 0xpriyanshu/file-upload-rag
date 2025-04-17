import express from "express";
import dotenv from "dotenv";
dotenv.config();
import {
    signUpClient,
    addAgent, getAgents,
    getAgentDetails,
    deleteAgent,
    updateAgent,
    updateUserLogs,
    getChatLogs,
    getAgentChatLogs,
    getServices,
    enableService,
    disableService,
    updateAgentUsername,
    updateCalendlyUrl
} from "../controllers/clientController.js";
import Agent from "../models/AgentModel.js";
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Jimp } from "jimp";


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

router.get("/getAgentDetails", async (req, res) => {
    try {
        const { agentId, username } = req.query;
        if(agentId == 'null' && username == 'null') {
            return res.status(400).json({ error: true, result: "Agent ID or username is required" });
        }
        let query = {};
        if (username != 'null') {
            query = { username };
        }
        else if (agentId != 'null') {
            query = { agentId };
        }
        const agent = await getAgentDetails(query);
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
        const { userId, sessionId, newUserLogs, agentId, content } = req.body;
        const chatLogs = await updateUserLogs(userId, sessionId, newUserLogs, agentId, content);
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

router.get("/getServices/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const services = await getServices(agentId);
        res.status(200).send(services);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/enableService", async (req, res) => {
    try {
        const service = await enableService(req.body);
        res.status(200).send(service);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/disableService", async (req, res) => {
    try {
        const service = await disableService(req.body);
        res.status(200).send(service);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateAgentUsername", async (req, res) => {
    try {
        const { agentId, agentName } = req.body;

        const agent = await updateAgentUsername(agentId, agentName);
        res.status(200).send(agent);
    } catch (error) {
        res.status(400).send(error);
    }
});

const upload = multer({ storage: multer.memoryStorage() });

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});


router.post('/uploadAgentLogo', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const { agentId } = req.body;

        if (!agentId) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Resize image using Jimp
        // const image = await Jimp.read(req.file.buffer);
        // image.cover({length: 400, width: 400}); // Resize and crop to cover 600x600
        // const resizedImageBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

        const uniqueFileName = `${agentId}.jpg`;

        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: uniqueFileName,
            Body: req.file.buffer, // Use the resized image buffer
            ContentType: 'image/jpeg',
        };

        const uploadCommand = new PutObjectCommand(uploadParams);
        await s3Client.send(uploadCommand);

        const fileUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

        try {
            await Agent.findOneAndUpdate(
                { agentId: agentId },
                { $set: { "logo": fileUrl } }
            );
        } catch (error) {
            console.error('Error updating agent logo:', error);
        }
        res.json({ success: true, fileUrl });
    } catch (error) {
        console.error('S3 Upload Error:', error);
        res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
});


router.post("/updateCalendlyUrl", async (req, res) => {
    try {
        const { agentId, calendlyUrl } = req.body;
        const agent = await updateCalendlyUrl(agentId, calendlyUrl);
        res.status(200).send(agent);
    } catch (error) {
        res.status(400).send(error);
    }
});

export default router;