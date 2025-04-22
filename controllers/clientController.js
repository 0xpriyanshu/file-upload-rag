import Client from "../models/ClientModel.js";
import Agent from "../models/AgentModel.js";
import Chat from "../models/ChatLogsModel.js";
import { generateAgentId } from "../utils/utils.js";
import { processDocument } from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";
import mongoose from "mongoose";
import Service from "../models/Service.js";
import { generateRandomUsername } from '../utils/usernameGenerator.js';

const successMessage = async (data) => {
    const returnData = {};
    returnData["error"] = false;
    returnData["result"] = data;

    return returnData;
};

const errorMessage = async (data) => {
    const returnData = {};
    returnData["error"] = true;
    returnData["result"] = data;

    return returnData;
};

async function signUpClient(req) {
    try {
        const { via, handle } = req.body;
        const client = await Client.findOne({ signUpVia: { via, handle } });
        if (client) {
            return await successMessage(client);
        }
        const newClient = new Client({ signUpVia: { via, handle }, agents: [] });
        await newClient.save();
        return await successMessage(newClient);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function getAgents(clientId) {
    try {
        const client = await Client.findById(clientId);
        if (!client) {
            return await errorMessage("Client not found");
        }
        const agents = await Agent.find({ clientId: clientId });
        const agentsInfo = agents.map(agent => ({
            name: agent.name || agent.documentCollectionId,
            agentId: agent.agentId,
            username: agent.username,
            logo: agent.logo
        }));

        return await successMessage(agentsInfo);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function addAgent(req) {
    try {
        const { clientId, documentCollectionId, name } = req.body;
        if (!clientId || !mongoose.Types.ObjectId.isValid(clientId)) {
            return await errorMessage("Invalid client ID format");
        }
        const agentId = await generateAgentId();
        const client = await Client.findById(clientId);

        if (!client) {
            return await errorMessage("Client not found");
        }

        const username = generateRandomUsername();
        const newAgent = await Agent.create({
            clientId,
            agentId,
            documentCollectionId,
            username: username,
            name: name || documentCollectionId
        });

        return await successMessage({
            agentId,
            clientId,
            documentCollectionId,
            name: name || documentCollectionId
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgent(data, agentId) {
    try {
        const { newText,
            name,
            model,
            systemPrompt,
            personalityType,
            isCustomPersonality,
            customPersonalityPrompt, personalityAnalysis, lastPersonalityUrl, lastPersonalityContent, themeColors } = data;

        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }

        if (!newText && !name && !model && !systemPrompt && !personalityType && isCustomPersonality === undefined && !customPersonalityPrompt && !personalityAnalysis && typeof lastPersonalityUrl === "undefined" && typeof lastPersonalityContent === "undefined") {
            return await errorMessage("At least one update parameter must be provided");
        }

        const agent = await Agent.findOne({ agentId });

        if (!agent) {
            return await errorMessage("Agent not found");
        }

        const collectionName = agent.documentCollectionId;
        let updated = false;
        let personalityUpdated = false;

        if (name && typeof name === 'string' && name.trim() !== '') {
            agent.name = name.trim();
            updated = true;
        }

        if (newText && typeof newText === 'string' && newText.trim() !== '') {
            try {
                await processDocument(newText, collectionName);
                updated = true;
            } catch (error) {
                return await errorMessage(`Error processing document: ${error.message}`);
            }
        }

        if (model) {
            agent.model = model;
            updated = true;
        }

        if (systemPrompt) {
            agent.systemPrompt = systemPrompt;
            updated = true;
        }

        if (personalityType) {
            agent.personalityType = personalityType;
            personalityUpdated = true;
            updated = true;
        }

        if (isCustomPersonality !== undefined) {
            agent.isCustomPersonality = isCustomPersonality;
            personalityUpdated = true;
            updated = true;
        }

        if (customPersonalityPrompt) {
            agent.customPersonalityPrompt = customPersonalityPrompt;
            personalityUpdated = true;
            updated = true;
        }

        if (personalityAnalysis) {
            agent.personalityAnalysis = personalityAnalysis;
            personalityUpdated = true;
            updated = true;
        }

        if (typeof lastPersonalityUrl !== "undefined") {
            agent.lastPersonalityUrl = lastPersonalityUrl;
            personalityUpdated = true;
            updated = true;
        }

        if (typeof lastPersonalityContent !== "undefined") {
            agent.lastPersonalityContent = lastPersonalityContent;
            personalityUpdated = true;
            updated = true;
        }

        if (themeColors) {
            agent.themeColors = themeColors;
            updated = true;
        }

        if (updated) {
            await agent.save();
        }

        return await successMessage({
            message: "Agent updated successfully",
            agentId,
            collectionName,
            name: agent.name,
            textUpdated: Boolean(newText),
            nameUpdated: Boolean(name),
            personalityUpdated: personalityUpdated
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function createNewAgent(data) {
    try {
        const { textContent, clientId, name } = data;

        if (!textContent || typeof textContent !== 'string' || textContent.trim() === '') {
            return await errorMessage("Invalid or empty text content");
        }

        if (!clientId || typeof clientId !== 'string' || !mongoose.Types.ObjectId.isValid(clientId)) {
            return await errorMessage("Invalid client ID format");
        }

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return await errorMessage("Invalid or empty agent name");
        }

        let collectionName;
        try {
            const result = await processDocument(textContent);
            collectionName = result.collectionName;
        } catch (error) {
            return await errorMessage(`Error processing document: ${error.message}`);
        }

        const agentResponse = await addAgent({
            body: {
                clientId,
                documentCollectionId: collectionName,
                name: name
            }
        });

        if (agentResponse.error) {
            return await errorMessage(agentResponse.result);
        }

        const newAgentId = agentResponse.result.agentId;

        return await successMessage({
            message: 'Document processed and agent created successfully',
            collectionName,
            agentId: newAgentId,
            clientId,
            name
        });
    } catch (error) {
        return await errorMessage(`Error creating new agent: ${error.message}`);
    }
}

async function queryDocument(data) {
    try {
        const { agentId, query } = data;

        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }

        if (!query || typeof query !== 'string' || query.trim() === '') {
            return await errorMessage("Invalid or empty query");
        }

        const agent = await Agent.findOne({ agentId });

        if (!agent) {
            return await errorMessage("Agent not found");
        }

        const collectionName = agent.documentCollectionId;

        let response;
        try {
            response = await queryFromDocument(collectionName, query);
        } catch (error) {
            return await errorMessage(`Error querying document: ${error.message}`);
        }

        return await successMessage({
            response,
            agentId,
            collectionName
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}



async function getAgentDetails(query) {
    try {
        const agent = await Agent.findOne(query);
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        return await successMessage(agent);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function deleteAgent(agentId) {
    try {
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        await agent.deleteOne();
        return await successMessage("Agent deleted successfully");
    } catch (error) {
        return await errorMessage(error.message);
    }
}

const updateUserLogs = async (userId, sessionId, newUserLog, agentId, content) => {
    try {
        const chatLogs = await Chat.findOne({ userId: userId, sessionId: sessionId, agentId: agentId });
        if (!agentId || !userId || !sessionId) {
            return await errorMessage("Invalid agent ID, user ID, or session ID");
        }
        if (!chatLogs) {
            const chatTitle = newUserLog[0].content.split("\n")[0];
            await Chat.create({ userId: userId, sessionId: sessionId, agentId: agentId, userLogs: newUserLog, content: content, chatTitle: chatTitle });
        }
        else {
            await Chat.findOneAndUpdate(
                { userId: userId, sessionId: sessionId },
                { $push: { "userLogs": { $each: newUserLog } } }
            );

        }
        return await successMessage("User logs updated successfully");
    }
    catch (error) {
        console.log("error", error);
        return await errorMessage(error.message);
    }
}

const getChatLogs = async (userId, sessionId, agentId) => {
    try {
        const chatLogs = await Chat.findOne({ userId: userId, sessionId: sessionId, agentId: agentId });
        if (!chatLogs) {
            return await successMessage([]);
        }
        return await successMessage(chatLogs.userLogs);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const getAgentChatLogs = async (agentId) => {
    try {
        const chatLogs = await Chat.find({ agentId: agentId });
        if (!chatLogs) {
            return await successMessage([]);
        }
        return await successMessage(chatLogs);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const getServices = async (agentId) => {
    try {
        const services = await Service.find({ agentId: agentId });
        if (!services.length == 0) {
            return await successMessage([
                {
                    serviceType: "GOOGLE_CALENDAR",
                    isEnabled: false
                },
                {
                    serviceType: "RAZORPAY",
                    isEnabled: false
                },
                {
                    serviceType: "STRIPE",
                    isEnabled: false
                }
            ]);
        }
        return await successMessage(services);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const enableService = async (data) => {
    try {
        const { agentId, clientId, serviceType, credentials } = data;
        // Check if a service with the same clientId and serviceType already exists
        const existingService = await Service.findOne({
            clientId: clientId,
            serviceType: serviceType,
            agentId: { $ne: agentId } // Exclude the current agent
        });

        // If an existing service is found, use its credentials
        if (existingService && existingService.credentials) {
            data.credentials = existingService.credentials;
        }
        const service = await Service.create({ ...data, credentials });
        return await successMessage(service);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const disableService = async (data) => {
    try {
        const { agentId, serviceType } = data;
        const service = await Service.findOneAndUpdate({ agentId, serviceType }, { $set: { isEnabled: false } });
        return await successMessage(service);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const updateAgentUsername = async (agentId, agentName) => {
    try {
        const agent = await Agent.findOne({ username: agentName });
        if (!agent) {
            await Agent.findOneAndUpdate({ agentId }, { $set: { username: agentName } });
            return await successMessage("username updated successfully");
        }
        else {
            return await errorMessage("username already exists");
        }
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const updateCalendlyUrl = async (agentId, calendlyUrl) => {
    try {
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        await Agent.findOneAndUpdate({ agentId }, { $set: { calendlyUrl: calendlyUrl } });
        return await successMessage("calendlyUrl updated successfully");
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const updateStripeAccountIdCurrency = async (agentId, stripeAccountId, currency) => {
    try {
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        await Agent.findOneAndUpdate({ agentId }, { $set: { stripeAccountId: stripeAccountId, currency: currency } });
        return await successMessage("stripeAccountId and currency updated successfully");
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}


export {
    signUpClient,
    addAgent,
    getAgents,
    updateAgent,
    createNewAgent,
    queryDocument,
    getAgentDetails,
    deleteAgent,
    updateUserLogs,
    getChatLogs,
    getAgentChatLogs,
    getServices,
    enableService,
    disableService,
    updateAgentUsername,
    updateCalendlyUrl,
    errorMessage,
    successMessage,
    updateStripeAccountIdCurrency
}; 