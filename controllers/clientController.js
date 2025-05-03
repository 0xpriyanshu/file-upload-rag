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

async function signUpClient(data) {
    try {
      const signUpViaObj = data.signUpVia || data;
      const via = signUpViaObj.via;
      const handle = signUpViaObj.handle;
      
      if (!via || !handle) {
        return errorMessage("Missing required fields: via and handle");
      }
      
      let client = await Client.findOne({ 
        "signUpVia.via": via, 
        "signUpVia.handle": handle 
      });
      
      if (!client) {
        client = new Client({ 
          signUpVia: { via, handle } 
        });
        await client.save();
      }
  
      const agentsRes = await getAgents(client._id);
      if (agentsRes.error) return errorMessage(agentsRes.result);
  
      client.agents = agentsRes.result;
      await client.save();
  
      return successMessage({
        client
      });
    } catch (err) {
      console.error("Error details:", err);
      return errorMessage(err.message);
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

// async function createNewAgent(data) {
//     try {
//         const { textContent, clientId, name } = data;

//         if (!textContent || typeof textContent !== 'string' || textContent.trim() === '') {
//             return await errorMessage("Invalid or empty text content");
//         }

//         if (!clientId || typeof clientId !== 'string' || !mongoose.Types.ObjectId.isValid(clientId)) {
//             return await errorMessage("Invalid client ID format");
//         }

//         if (!name || typeof name !== 'string' || name.trim() === '') {
//             return await errorMessage("Invalid or empty agent name");
//         }

//         const { collectionName, documentId } = await processDocument(textContent);
        
//         const agentResponse = await addAgent({
//             body: {
//                 clientId,
//                 documentCollectionId: collectionName,
//                 name: name
//             }
//         });

//         if (agentResponse.error) {
//             return await errorMessage(agentResponse.result);
//         }

//         const newAgentId = agentResponse.result.agentId;
        
//         const agent = await Agent.findOne({ agentId: newAgentId });
//         agent.documents = [{
//             documentId,
//             title: 'Initial Document',
//             addedAt: new Date(),
//             updatedAt: new Date()
//         }];
//         await agent.save();

//         return await successMessage({
//             message: 'Document processed and agent created successfully',
//             collectionName,
//             agentId: newAgentId,
//             clientId,
//             name,
//             documentId
//         });
//     } catch (error) {
//         return await errorMessage(`Error creating new agent: ${error.message}`);
//     }
// }


async function createNewAgent(data) {
    try {
      const { clientId, name, personalityType, themeColors } = data;
  
      if (
        !clientId ||
        typeof clientId !== "string" ||
        !mongoose.Types.ObjectId.isValid(clientId)
      ) {
        return errorMessage("Invalid client ID format");
      }
  
      if (!name || typeof name !== "string" || name.trim() === "") {
        return errorMessage("Invalid or empty agent name");
      }
  
      if (
        !personalityType ||
        typeof personalityType !== "object" ||
        typeof personalityType.name !== "string" ||
        !Array.isArray(personalityType.value) ||
        !personalityType.value.every(v => typeof v === "string")
      ) {
        return errorMessage(
          "Invalid personalityType: expected { name: string, value: string[] }"
        );
      }
  
      if (
        !themeColors ||
        typeof themeColors !== "object" ||
        Array.isArray(themeColors)
      ) {
        return errorMessage("Invalid or missing themeColors object");
      }
  
      const documentCollectionId = new mongoose.Types.ObjectId().toString();
  
      const agentResponse = await addAgent({
        body: {
          clientId,
          documentCollectionId,
          name,
          personalityType,  
          themeColors,
        },
      });
  
      if (agentResponse.error) {
        return errorMessage(agentResponse.result);
      }
      return successMessage({
        message: "Agent created successfully",
        agentId: agentResponse.result.agentId,
        clientId,
        name,
        personalityType,
        themeColors,
        documentCollectionId,
      });
    } catch (err) {
      return errorMessage(`Error creating new agent: ${err.message}`);
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

        agentWithServices.name = agent.name || "Agent";
        agentWithServices.bio = agent.bio || "";
        agentWithServices.promotionalBanner = agent.promotionalBanner || "";
        agentWithServices.isPromoBannerEnabled = agent.isPromoBannerEnabled || false;
        agentWithServices.personalityType = agent.personalityType;
        agentWithServices.welcomeMessage = agent.welcomeMessage || "Hi there! How can I help you?";
        agentWithServices.prompts = agent.prompts || ["Tell me more"];
        agentWithServices.language = agent.language || "English";
        agentWithServices.smartenUpAnswers = agent.smartenUpAnswers || ["", "", "", ""];
        agentWithServices.currency = agent.currency || "USD";
        agentWithServices.preferredPaymentMethod = agent.preferredPaymentMethod || "Stripe";
        agentWithServices.paymentMethods = agent.paymentMethods || {
            stripe: { enabled: false, accountId: "" },
            razorpay: { enabled: false, accountId: "" },
            usdt: { enabled: false, walletAddress: "", chains: [] },
            usdc: { enabled: false, walletAddress: "", chains: [] }
        };
        
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

async function updateAgentNameAndBio(data) {
    try {
        const { agentId, name, bio } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if ((!name || typeof name !== 'string') && (!bio || typeof bio !== 'string')) {
            return await errorMessage("At least one valid update parameter (name or bio) must be provided");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        let updated = false;
        
        if (name && typeof name === 'string' && name.trim() !== '') {
            agent.name = name.trim();
            updated = true;
        }
        
        if (bio && typeof bio === 'string') {
            agent.bio = bio.trim();
            updated = true;
        }
        
        if (updated) {
            await agent.save();
        }
        
        return await successMessage({
            message: "Agent profile updated successfully",
            agentId,
            name: agent.name,
            bio: agent.bio,
            nameUpdated: Boolean(name),
            bioUpdated: Boolean(bio)
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentPromoBanner(data) {
    try {
        const { agentId, promotionalBanner, isPromoBannerEnabled } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if ((promotionalBanner === undefined || typeof promotionalBanner !== 'string') 
            && isPromoBannerEnabled === undefined) {
            return await errorMessage("At least one valid update parameter (promotionalBanner or isPromoBannerEnabled) must be provided");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        let updated = false;
        
        if (promotionalBanner !== undefined && typeof promotionalBanner === 'string') {
            if (promotionalBanner.length > 50) {
                return await errorMessage("Promotional banner text cannot exceed 50 characters");
            }
            agent.promotionalBanner = promotionalBanner.trim();
            updated = true;
        }
        
        if (isPromoBannerEnabled !== undefined) {
            agent.isPromoBannerEnabled = Boolean(isPromoBannerEnabled);
            updated = true;
        }
        
        if (updated) {
            await agent.save();
        }
        
        return await successMessage({
            message: "Promotional banner updated successfully",
            agentId,
            promotionalBanner: agent.promotionalBanner,
            isPromoBannerEnabled: agent.isPromoBannerEnabled,
            bannerTextUpdated: promotionalBanner !== undefined,
            bannerEnabledUpdated: isPromoBannerEnabled !== undefined
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentVoicePersonality(data) {
    try {
        const { 
            agentId,
            personalityType
        } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!personalityType || typeof personalityType !== 'object') {
            return await errorMessage("personalityType is required and must be an object");
        }
        
        if (!personalityType.name) {
            return await errorMessage("personalityType.name is required");
        }
        
        if (!personalityType.value || !Array.isArray(personalityType.value)) {
            return await errorMessage("personalityType.value must be an array");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        agent.personalityType = personalityType;
        
        await agent.save();
        
        return await successMessage({
            message: "Personality type updated successfully",
            agentId,
            personalityType: agent.personalityType
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentWelcomeMessage(data) {
    try {
        const { agentId, welcomeMessage } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!welcomeMessage || typeof welcomeMessage !== 'string') {
            return await errorMessage("Welcome message is required");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        agent.welcomeMessage = welcomeMessage.trim();
        
        await agent.save();
        
        return await successMessage({
            message: "Welcome message updated successfully",
            agentId,
            welcomeMessage: agent.welcomeMessage
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentPrompts(data) {
    try {
        const { agentId, prompts } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!Array.isArray(prompts)) {
            return await errorMessage("Prompts must be an array");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        agent.prompts = prompts;
        
        await agent.save();
        
        return await successMessage({
            message: "Prompts updated successfully",
            agentId,
            prompts: agent.prompts
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentBrain(data) {
    try {
        const { agentId, language, smartenUpAnswers } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!language && !smartenUpAnswers) {
            return await errorMessage("At least one of language or smartenUpAnswers must be provided");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        let updated = false;
        
        if (language && typeof language === 'string') {
            agent.language = language;
            updated = true;
        }
        
        if (smartenUpAnswers) {
            if (Array.isArray(smartenUpAnswers)) {
                const answers = [...smartenUpAnswers];
                while (answers.length < 4) {
                    answers.push("");
                }
                agent.smartenUpAnswers = answers.slice(0, 4);
                updated = true;
            } 
            else if (typeof smartenUpAnswers === 'object') {
                if (!agent.smartenUpAnswers || !Array.isArray(agent.smartenUpAnswers)) {
                    agent.smartenUpAnswers = ["", "", "", ""];
                }
                
                Object.entries(smartenUpAnswers).forEach(([index, value]) => {
                    const idx = parseInt(index);
                    if (!isNaN(idx) && idx >= 0 && idx < 4 && typeof value === 'string') {
                        agent.smartenUpAnswers[idx] = value;
                        updated = true;
                    }
                });
            }
        }
        
        if (updated) {
            await agent.save();
        }
        
        return await successMessage({
            message: "Brain information updated successfully",
            agentId,
            language: agent.language,
            smartenUpAnswers: agent.smartenUpAnswers,
            languageUpdated: Boolean(language),
            smartenUpAnswersUpdated: Boolean(smartenUpAnswers)
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentPaymentSettings(data) {
    try {
        const { 
            agentId, 
            currency, 
            preferredPaymentMethod,
            paymentMethods  
        } = data;
        
        const newlyEnabled = {
            stripe: false,
            razorpay: false,
            usdt: false,
            usdc: false
        };
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
    
        if (!currency && !preferredPaymentMethod && !paymentMethods) {
            return await errorMessage("At least one payment setting must be provided");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.paymentMethods) {
            agent.paymentMethods = {
                stripe: { enabled: false, accountId: "" },
                razorpay: { enabled: false, accountId: "" },
                usdt: { enabled: false, walletAddress: "", chains: [] },
                usdc: { enabled: false, walletAddress: "", chains: [] }
            };
        }
        
        if (currency) {
            agent.currency = currency;
        }
        
        // Process the nested paymentMethods structure
        if (paymentMethods) {
            // Stripe
            if (paymentMethods.stripe) {
                if (paymentMethods.stripe.accountId) {
                    agent.paymentMethods.stripe.accountId = paymentMethods.stripe.accountId;
                }
                
                if (typeof paymentMethods.stripe.enabled === 'boolean') {
                    if (paymentMethods.stripe.enabled && !agent.paymentMethods.stripe.accountId && !paymentMethods.stripe.accountId) {
                        return await errorMessage("Cannot enable Stripe without providing an account ID");
                    }
                    
                    if (paymentMethods.stripe.enabled && !agent.paymentMethods.stripe.enabled) {
                        newlyEnabled.stripe = true;
                    }
                    
                    agent.paymentMethods.stripe.enabled = paymentMethods.stripe.enabled;
                }
            }
            
            // Razorpay
            if (paymentMethods.razorpay) {
                if (paymentMethods.razorpay.accountId) {
                    agent.paymentMethods.razorpay.accountId = paymentMethods.razorpay.accountId;
                }
                
                if (typeof paymentMethods.razorpay.enabled === 'boolean') {
                    if (paymentMethods.razorpay.enabled && !agent.paymentMethods.razorpay.accountId && !paymentMethods.razorpay.accountId) {
                        return await errorMessage("Cannot enable Razorpay without providing an account ID");
                    }
                    
                    if (paymentMethods.razorpay.enabled && !agent.paymentMethods.razorpay.enabled) {
                        newlyEnabled.razorpay = true;
                    }
                    
                    agent.paymentMethods.razorpay.enabled = paymentMethods.razorpay.enabled;
                }
            }
            
            // USDT
            if (paymentMethods.usdt) {
                if (paymentMethods.usdt.walletAddress) {
                    agent.paymentMethods.usdt.walletAddress = paymentMethods.usdt.walletAddress;
                }
                
                if (Array.isArray(paymentMethods.usdt.chains)) {
                    agent.paymentMethods.usdt.chains = paymentMethods.usdt.chains;
                }
                
                if (typeof paymentMethods.usdt.enabled === 'boolean') {
                    if (paymentMethods.usdt.enabled && !agent.paymentMethods.usdt.walletAddress && !paymentMethods.usdt.walletAddress) {
                        return await errorMessage("Cannot enable USDT without providing a wallet address");
                    }
                    
                    if (paymentMethods.usdt.enabled && !agent.paymentMethods.usdt.enabled) {
                        newlyEnabled.usdt = true;
                    }
                    
                    agent.paymentMethods.usdt.enabled = paymentMethods.usdt.enabled;
                }
            }
            
            // USDC
            if (paymentMethods.usdc) {
                if (paymentMethods.usdc.walletAddress) {
                    agent.paymentMethods.usdc.walletAddress = paymentMethods.usdc.walletAddress;
                }
                
                if (Array.isArray(paymentMethods.usdc.chains)) {
                    agent.paymentMethods.usdc.chains = paymentMethods.usdc.chains;
                }
                
                if (typeof paymentMethods.usdc.enabled === 'boolean') {
                    if (paymentMethods.usdc.enabled && !agent.paymentMethods.usdc.walletAddress && !paymentMethods.usdc.walletAddress) {
                        return await errorMessage("Cannot enable USDC without providing a wallet address");
                    }
                    
                    if (paymentMethods.usdc.enabled && !agent.paymentMethods.usdc.enabled) {
                        newlyEnabled.usdc = true;
                    }
                    
                    agent.paymentMethods.usdc.enabled = paymentMethods.usdc.enabled;
                }
            }
        }
        
        if (preferredPaymentMethod) {
            const validMethods = ['Stripe', 'Razorpay', 'USDT', 'USDC'];
            if (!validMethods.includes(preferredPaymentMethod)) {
                return await errorMessage("Invalid preferred payment method. Must be one of: Stripe, Razorpay, USDT, USDC");
            }
            
            const methodKey = preferredPaymentMethod.toLowerCase();
            
            if (!agent.paymentMethods[methodKey].enabled && !newlyEnabled[methodKey]) {
                return await errorMessage(`Cannot set ${preferredPaymentMethod} as preferred payment method because it is not enabled. Please enable it first.`);
            }
            
            agent.preferredPaymentMethod = preferredPaymentMethod;
        }
        
        if (agent.preferredPaymentMethod) {
            const methodKey = agent.preferredPaymentMethod.toLowerCase();
            
            const isBeingDisabled = paymentMethods && paymentMethods[methodKey] && 
                                   paymentMethods[methodKey].enabled === false;
            
            if (!agent.paymentMethods[methodKey].enabled || isBeingDisabled) {
                const enabledMethod = Object.entries(agent.paymentMethods)
                    .find(([key, settings]) => {
                        if (paymentMethods && paymentMethods[key] && paymentMethods[key].enabled === false) {
                            return false;
                        }
                        
                        return settings.enabled || newlyEnabled[key];
                    });
                
                if (enabledMethod) {
                    agent.preferredPaymentMethod = enabledMethod[0].charAt(0).toUpperCase() + enabledMethod[0].slice(1);
                } else {
                    agent.preferredPaymentMethod = null; 
                }
            }
        }
        
        await agent.save();
        
        return await successMessage({
            message: "Payment settings updated successfully",
            agentId,
            currency: agent.currency,
            preferredPaymentMethod: agent.preferredPaymentMethod,
            paymentMethods: agent.paymentMethods
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgentPolicy(data) {
    try {
        const { 
            agentId, 
            policyId,
            custom = false, 
            enabled,
            content
        } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!policyId || typeof policyId !== 'string') {
            return await errorMessage("Policy ID is required");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.policies) {
            await Agent.updateOne(
                { agentId },
                { $set: { 
                    policies: {
                        shipping: { enabled: false, content: "" },
                        returns: { enabled: false, content: "" },
                        privacy: { enabled: false, content: "" },
                        terms: { enabled: false, content: "" },
                        custom: {}
                    }
                }}
            );
            const updatedAgent = await Agent.findOne({ agentId });
            if (!updatedAgent.policies) {
                return await errorMessage("Failed to initialize policies");
            }
        }
        
        let currentAgent = await Agent.findOne({ agentId });
        
        if (enabled === true && !content && content !== "") {
            let existingContent = "";
            
            if (!custom) {
                existingContent = currentAgent.policies[policyId]?.content || "";
            } else {
                existingContent = currentAgent.policies.custom?.[policyId]?.content || "";
            }
            
            if (!existingContent) {
                return await errorMessage("Cannot enable policy without content. Please provide content when enabling a policy.");
            }
        }
        
        if (!custom) {
            const defaultPolicies = ['shipping', 'returns', 'privacy', 'terms'];
            if (!defaultPolicies.includes(policyId)) {
                return await errorMessage("Invalid default policy ID. Default policies must be one of: shipping, returns, privacy, terms");
            }
            
            const updateData = {};
            
            if (enabled !== undefined) {
                updateData[`policies.${policyId}.enabled`] = Boolean(enabled);
            }
            
            if (content !== undefined) {
                updateData[`policies.${policyId}.content`] = content;
            }
            
            await Agent.updateOne(
                { agentId },
                { $set: updateData }
            );
            
            currentAgent = await Agent.findOne({ agentId });
            
            return await successMessage({
                message: "Policy updated successfully",
                agentId,
                policyId,
                policy: currentAgent.policies[policyId]
            });
        } else {
            if (!currentAgent.policies.custom) {
                await Agent.updateOne(
                    { agentId },
                    { $set: { 'policies.custom': {} } }
                );
            }
            
            const policyData = {
                enabled: enabled !== undefined ? Boolean(enabled) : false,
                content: content || ""
            };
            
            const updateObj = {};
            updateObj[`policies.custom.${policyId}`] = policyData;
            
            await Agent.updateOne(
                { agentId },
                { $set: updateObj }
            );
            
            currentAgent = await Agent.findOne({ agentId });
            
            if (!currentAgent.policies.custom || !currentAgent.policies.custom[policyId]) {
                return await errorMessage("Failed to update custom policy");
            }
            
            return await successMessage({
                message: "Custom policy updated successfully",
                agentId,
                policyId,
                policy: currentAgent.policies.custom[policyId]
            });
        }
    } catch (error) {
        console.error("Error updating policy:", error);
        return await errorMessage(error.message);
    }
}

async function getAgentPolicies(agentId) {
    try {
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        const agent = await Agent.findOne({ agentId });
        
        if (!agent) {
            return await errorMessage("Agent not found");
        }
        
        if (!agent.policies) {
            return await successMessage({
                shipping: { enabled: false, content: "" },
                returns: { enabled: false, content: "" },
                privacy: { enabled: false, content: "" },
                terms: { enabled: false, content: "" },
                custom: {}  
            });
        }
        
        if (!agent.policies.custom) {
            agent.policies.custom = {};
        }
        
        return await successMessage(agent.policies);
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
    listAgentDocuments,
    updateAgentNameAndBio,
    updateAgentPromoBanner,
    updateAgentVoicePersonality,
    updateAgentWelcomeMessage,
    updateAgentPrompts,
    updateAgentBrain,
    updateAgentPaymentSettings,
    updateAgentPolicy,
    getAgentPolicies
};