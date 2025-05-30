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
    updateCalendlyUrl,
    updateStripeAccountIdCurrency,
    getAgentOrders,
    updateFeatures,
    updateSocialHandles,
    updateAgentNameAndBio,
    updateAgentPromoBanner,
    updateAgentVoicePersonality,
    updateAgentWelcomeMessage,
    updateAgentPrompts,
    updateAgentBrain,
    enableStripePayment,
    completeStripeOnboarding,
    updateAgentPolicy,
    getAgentPolicies,
    updateAgentTheme,
    changeCustomerLeadFlag,
    saveCustomerLeads,
    getCustomerLeads,
    getPlans,
    subscribeToCredits,
    updateAgentModel,
    updateAgentGeneratedPrompts,
    updateClientBillingDetails,
    updateClientBillingMethod,
    getClient,
    getClientUsage,
    updateCustomHandles
} from "../controllers/clientController.js";
import Agent from "../models/AgentModel.js";
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Jimp } from "jimp";


const router = express.Router();

router.post("/signupClient", async (req, res) => {
    try {
        const client = await signUpClient(req);
        res.status(200).send(client);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/getClient/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const client = await getClient(clientId);
        res.status(200).send(client);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/getClientUsage/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const client = await getClientUsage(clientId);
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
        const { inputParam, isfetchByUsername } = req.query;
        if (inputParam == 'null') {
            return res.status(400).json({ error: true, result: "Agent ID or username is required" });
        }
        let query = {};
        if (isfetchByUsername == 'true') {
            query = { username: inputParam };
        }
        else if (isfetchByUsername == 'false') {
            query = { agentId: inputParam };
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
        const response = await deleteAgent(agentId);
        res.status(response.error ? 400 : 200).send(response);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/deleteAgentPost/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const response = await deleteAgent(agentId);
        res.status(response.error ? 400 : 200).send(response);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
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

        const logo = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;

        try {
            await Agent.findOneAndUpdate(
                { agentId: agentId },
                { $set: { "logo": logo } }
            );
            return res.json({ error: false, result: logo });
        } catch (error) {
            console.error('Error updating agent logo:', error);
            return res.json({ error: true, result: 'Failed to upload image' });
        }
    } catch (error) {
        console.error('S3 Upload Error:', error);
        return res.json({ error: true, result: 'Failed to upload image' });
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

router.post("/updateStripeAccountIdCurrency", async (req, res) => {
    try {
        const { agentId, stripeAccountId, currency } = req.body;
        const agent = await updateStripeAccountIdCurrency(agentId, stripeAccountId, currency);
        res.status(200).send(agent);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get("/getAgentOrders", async (req, res) => {
    try {
        const { agentId, page } = req.query;
        const orders = await getAgentOrders(agentId, page);
        res.status(200).send(orders);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateFeatures", async (req, res) => {
    try {
        const features = await updateFeatures(req);
        res.status(200).send(features);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateSocialHandles", async (req, res) => {
    try {
        const result = await updateSocialHandles(req);
        res.status(200).send(result);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateAgentNameAndBio", async (req, res) => {
    try {
        const result = await updateAgentNameAndBio(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentPromoBanner", async (req, res) => {
    try {
        const result = await updateAgentPromoBanner(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentVoicePersonality", async (req, res) => {
    try {
        const result = await updateAgentVoicePersonality(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentWelcomeMessage", async (req, res) => {
    try {
        const result = await updateAgentWelcomeMessage(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentPrompts", async (req, res) => {
    try {
        const result = await updateAgentPrompts(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentBrain", async (req, res) => {
    try {
        const result = await updateAgentBrain(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/enableStripePayment", async (req, res) => {
    try {
        const result = await enableStripePayment(req.body);
        res.status(200).send(result);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/completeStripeOnboarding", async (req, res) => {  
    try {
        const result = await completeStripeOnboarding(req.body);
        res.status(200).send(result);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post("/updateAgentPolicy", async (req, res) => {
    try {
        const result = await updateAgentPolicy(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.get("/getAgentPolicies/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const result = await getAgentPolicies(agentId);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.put("/updateAgentTheme/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const result = await updateAgentTheme(req.body, agentId);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});


router.post("/changeCustomerLeadFlag", async (req, res) => {
    try {
        const { agentId, isEnabled } = req.body;
        const result = await changeCustomerLeadFlag(agentId, isEnabled);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/saveCustomerLeads", async (req, res) => {
    try {
        const { agentId, newLead } = req.body;
        const result = await saveCustomerLeads(agentId, newLead);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.get("/getCustomerLeads/:agentId", async (req, res) => {
    try {
        const { agentId } = req.params;
        const result = await getCustomerLeads(agentId);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.get("/getPlans/:clientId", async (req, res) => {
    try {
        const { clientId } = req.params;
        const result = await getPlans(clientId);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/subscribeToCredits", async (req, res) => {
    try {
        const result = await subscribeToCredits(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.put("/updateAgentModel", async (req, res) => {
    try {
        const { agentId, model } = req.body;
        const result = await updateAgentModel(agentId, model);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateAgentGeneratedPrompts", async (req, res) => {
    try {
        const result = await updateAgentGeneratedPrompts(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateClientBillingDetails", async (req, res) => {
    try {
        const result = await updateClientBillingDetails(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});

router.post("/updateClientBillingMethod", async (req, res) => {
    try {
        const result = await updateClientBillingMethod(req.body);
        res.status(result.error ? 400 : 200).send(result);
    } catch (error) {
        res.status(400).send({
            error: true,
            result: error.message
        });
    }
});


router.post('/updateCustomHandles', async (req, res) => {
    try {
        const { agentId, customHandles } = req.body;
        const updatedCustomHandles = await updateCustomHandles(agentId, customHandles);
        res.status(200).send(updatedCustomHandles);
    } catch (error) {
        res.status(400).send(error);
    }
});



export default router;