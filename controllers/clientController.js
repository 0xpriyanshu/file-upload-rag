import Client from "../models/ClientModel.js";
import Agent from "../models/AgentModel.js";
import Chat from "../models/ChatLogsModel.js";
import { generateAgentId } from "../utils/utils.js";
import { 
  processDocument, 
  deleteEntitiesFromCollection,
  addDocumentToCollection,
  deleteDocumentFromCollection,
  updateDocumentInCollection
} from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";
import mongoose from "mongoose";
import Service from "../models/Service.js";
import Feature from "../models/Feature.js";
import SocialHandle from "../models/SocialHandle.js";
import { generateRandomUsername } from '../utils/usernameGenerator.js';
import OrderModel from "../models/OrderModel.js";

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

        const username = await generateRandomUsername();
        const newAgent = await Agent.create({
            clientId,
            agentId,
            documentCollectionId,
            username: username,
            name: name || documentCollectionId,
            documents: [] 
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
        const { 
            newText, 
            documentId,  
            name,
            model,
            systemPrompt,
            personalityType,
            isCustomPersonality,
            customPersonalityPrompt, 
            personalityAnalysis, 
            lastPersonalityUrl, 
            lastPersonalityContent, 
            themeColors 
        } = data;

        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }

        if (!newText && !name && !model && !systemPrompt && !personalityType && 
            isCustomPersonality === undefined && !customPersonalityPrompt && 
            !personalityAnalysis && typeof lastPersonalityUrl === "undefined" && 
            typeof lastPersonalityContent === "undefined" && !themeColors) {
            return await errorMessage("At least one update parameter must be provided");
        }

        const agent = await Agent.findOne({ agentId });

        if (!agent) {
            return await errorMessage("Agent not found");
        }

        const collectionName = agent.documentCollectionId;
        let updated = false;
        let personalityUpdated = false;
        let documentUpdated = false;

        if (name && typeof name === 'string' && name.trim() !== '') {
            agent.name = name.trim();
            updated = true;
        }

        if (newText && typeof newText === 'string' && newText.trim() !== '') {
            try {
                if (documentId) {
                    const docIndex = agent.documents.findIndex(doc => doc.documentId === documentId);
                    
                    if (docIndex === -1) {
                        return await errorMessage("Document not found for this agent");
                    }
                    
                    await updateDocumentInCollection(newText, collectionName, documentId);
                    agent.documents[docIndex].updatedAt = new Date();
                } else {
                    await deleteEntitiesFromCollection(collectionName);
                    const { documentId: newDocId } = await addDocumentToCollection(newText, collectionName);
                    
                    agent.documents = [{
                        documentId: newDocId,
                        title: 'Updated Document',
                        addedAt: new Date(),
                        updatedAt: new Date()
                    }];
                }
                
                documentUpdated = true;
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
            personalityUpdated: personalityUpdated,
            documentUpdated: documentUpdated
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

        const { collectionName, documentId } = await processDocument(textContent);
        
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
        
        const agent = await Agent.findOne({ agentId: newAgentId });
        agent.documents = [{
            documentId,
            title: 'Initial Document',
            addedAt: new Date(),
            updatedAt: new Date()
        }];
        await agent.save();

        return await successMessage({
            message: 'Document processed and agent created successfully',
            collectionName,
            agentId: newAgentId,
            clientId,
            name,
            documentId
        });
    } catch (error) {
        return await errorMessage(`Error creating new agent: ${error.message}`);
    }
}

async function deleteAgent(agentId) {
    try {
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        const collectionName = agent.documentCollectionId;
        
        await agent.deleteOne();
        
        if (collectionName) {
            try {
                await deleteEntitiesFromCollection(collectionName);
                console.log(`Successfully deleted Milvus collection: ${collectionName}`);
            } catch (milvusError) {
                console.error(`Warning: Failed to delete Milvus collection: ${milvusError.message}`);
            }
        }
        
        return await successMessage("Agent and associated Milvus collection deleted successfully");
    } catch (error) {
        return await errorMessage(error.message);
    }
}

/**
 * Adds a document to an agent's collection
 * @param {Object} data - The request data
 * @returns {Promise<Object>} The result of the operation
 */
async function addDocumentToAgent(data) {
    try {
        const { agentId, textContent, documentTitle } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!textContent || typeof textContent !== 'string' || textContent.trim() === '') {
            return await errorMessage("Invalid or empty text content");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        const collectionName = agent.documentCollectionId;
        
        const { documentId } = await addDocumentToCollection(textContent, collectionName);
        
        agent.documents = agent.documents || []; 
        agent.documents.push({
            documentId,
            title: documentTitle || 'Untitled Document',
            addedAt: new Date(),
            updatedAt: new Date()
        });
        
        await agent.save();
        
        return await successMessage({
            message: "Document added successfully",
            agentId,
            documentId,
            title: documentTitle || 'Untitled Document'
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

/**
 * Updates a document in an agent's collection
 * @param {Object} data - The request data
 * @returns {Promise<Object>} The result of the operation
 */
async function updateDocumentInAgent(data) {
    try {
        const { agentId, documentId, textContent, documentTitle } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!documentId || typeof documentId !== 'string') {
            return await errorMessage("Invalid document ID");
        }
        
        if (!textContent || typeof textContent !== 'string' || textContent.trim() === '') {
            return await errorMessage("Invalid or empty text content");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.documents) {
            agent.documents = [];
        }
        
        const documentIndex = agent.documents.findIndex(doc => doc.documentId === documentId);
        if (documentIndex === -1) {
            return await errorMessage("Document not found for this agent");
        }
        
        const collectionName = agent.documentCollectionId;
        
        await updateDocumentInCollection(textContent, collectionName, documentId);
        
        if (documentTitle) {
            agent.documents[documentIndex].title = documentTitle;
        }
        agent.documents[documentIndex].updatedAt = new Date();
        
        await agent.save();
        
        return await successMessage({
            message: "Document updated successfully",
            agentId,
            documentId,
            title: agent.documents[documentIndex].title
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

/**
 * Removes a document from an agent's collection
 * @param {Object} data - The request data
 * @returns {Promise<Object>} The result of the operation
 */
async function removeDocumentFromAgent(data) {
    try {
        const { agentId, documentId } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!documentId || typeof documentId !== 'string') {
            return await errorMessage("Invalid document ID");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.documents) {
            return await errorMessage("No documents found for this agent");
        }
        
        const documentIndex = agent.documents.findIndex(doc => doc.documentId === documentId);
        if (documentIndex === -1) {
            return await errorMessage("Document not found for this agent");
        }
        
        if (agent.documents.length === 1) {
            return await errorMessage("Cannot remove the only document. An agent must have at least one document.");
        }
        
        const collectionName = agent.documentCollectionId;
        
        await deleteDocumentFromCollection(collectionName, documentId);
        
        agent.documents.splice(documentIndex, 1);
        
        await agent.save();
        
        return await successMessage({
            message: "Document removed successfully",
            agentId,
            documentId,
            remainingDocumentCount: agent.documents.length
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

/**
 * Lists all documents for an agent
 * @param {string} agentId - The agent ID
 * @returns {Promise<Object>} The list of documents
 */
async function listAgentDocuments(agentId) {
    try {
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.documents) {
            agent.documents = [];
            await agent.save();
        }
        
        return await successMessage({
            agentId,
            agentName: agent.name,
            documentCount: agent.documents.length,
            documents: agent.documents.map(doc => ({
                documentId: doc.documentId,
                title: doc.title,
                addedAt: doc.addedAt,
                updatedAt: doc.updatedAt
            }))
        });
    } catch (error) {
        return await errorMessage(error.message);
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
        
        const activeServices = await Service.find({ 
            agentId: agent.agentId,
            isEnabled: true 
        });
        
        const activeFeatures = await Feature.find({
            agentId: agent.agentId,
            isEnabled: true
        });
        
        const socialHandles = await SocialHandle.findOne({ agentId: agent.agentId });
        
        const agentWithServices = agent.toObject();
        
        agentWithServices.services = activeServices.map(service => service.serviceType);

        agentWithServices.features = activeFeatures.map(feature => feature.featureType);

        if (socialHandles) {
            agentWithServices.socials = {
                instagram: socialHandles.instagram || "",
                tiktok: socialHandles.tiktok || "",
                twitter: socialHandles.twitter || "",
                facebook: socialHandles.facebook || "",
                youtube: socialHandles.youtube || "",
                linkedin: socialHandles.linkedin || "",
                snapchat: socialHandles.snapchat || ""
            };
        } else {
            agentWithServices.socials = {
                instagram: "",
                tiktok: "",
                twitter: "",
                facebook: "",
                youtube: "",
                linkedin: "",
                snapchat: ""
            };
        }
        
        return await successMessage(agentWithServices);
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

const getAgentOrders = async (agentId) => {
    try {
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        const orders = await OrderModel.find({ agentId: agentId, status: "COMPLETED" }).sort({ createdAt: -1 });
        return await successMessage(orders);
    }
    catch (error) {
        return await errorMessage(error.message);
    }
}

const updateFeatures = async (req) => {
    try {
        const { agentId, enabledFeatures } = req.body;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!Array.isArray(enabledFeatures)) {
            return await errorMessage("enabledFeatures must be an array");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        await Feature.updateMany(
            { agentId },
            { $set: { isEnabled: false } }
        );
        
        for (const featureType of enabledFeatures) {
            // Check if feature exists
            const existingFeature = await Feature.findOne({ 
                agentId, 
                featureType 
            });
            
            if (existingFeature) {
                existingFeature.isEnabled = true;
                await existingFeature.save();
            } else {
                await Feature.create({
                    agentId,
                    featureType,
                    isEnabled: true
                });
            }
        }
        
        const updatedFeatures = await Feature.find({ 
            agentId,
            isEnabled: true 
        });
        
        return await successMessage(updatedFeatures.map(feature => feature.featureType));
    } catch (error) {
        return await errorMessage(error.message);
    }
}

const updateSocialHandles = async (req) => {
    try {
        const { agentId, socials } = req.body;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!socials || typeof socials !== 'object') {
            return await errorMessage("socials must be an object");
        }
        
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return await errorMessage("Agent not found");
        }

        let socialHandles = await SocialHandle.findOne({ agentId });
        
        if (!socialHandles) {
            socialHandles = new SocialHandle({
                agentId,
                ...socials
            });
        } else {
            if (socials.instagram !== undefined) socialHandles.instagram = socials.instagram;
            if (socials.tiktok !== undefined) socialHandles.tiktok = socials.tiktok;
            if (socials.twitter !== undefined) socialHandles.twitter = socials.twitter;
            if (socials.facebook !== undefined) socialHandles.facebook = socials.facebook;
            if (socials.youtube !== undefined) socialHandles.youtube = socials.youtube;
            if (socials.linkedin !== undefined) socialHandles.linkedin = socials.linkedin;
            if (socials.snapchat !== undefined) socialHandles.snapchat = socials.snapchat;
        }
        
        await socialHandles.save();
        
        return await successMessage({
            message: "Social handles updated successfully",
            socials: {
                instagram: socialHandles.instagram,
                tiktok: socialHandles.tiktok,
                twitter: socialHandles.twitter,
                facebook: socialHandles.facebook,
                youtube: socialHandles.youtube,
                linkedin: socialHandles.linkedin,
                snapchat: socialHandles.snapchat
            }
        });
    } catch (error) {
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
    updateStripeAccountIdCurrency,
    getAgentOrders,
    updateFeatures,
    updateSocialHandles,
    addDocumentToAgent,
    updateDocumentInAgent,
    removeDocumentFromAgent,
    listAgentDocuments
};