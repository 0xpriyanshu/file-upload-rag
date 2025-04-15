import Client from "../models/ClientModel.js";
import Agent from "../models/AgentModel.js";
import Chat from "../models/ChatLogsModel.js";
import { generateAgentId } from "../utils/utils.js";
import { processDocument } from "../utils/documentProcessing.js";
import { queryFromDocument } from "../utils/ragSearch.js";

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
            agentId: agent.agentId
        }));

        return await successMessage(agentsInfo);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function addAgent(req) {
    try {
        const { clientId, documentCollectionId, name } = req.body;
        const agentId = await generateAgentId();
        const client = await Client.findById(clientId);

        if (!client) {
            return await errorMessage("Client not found");
        }

        await Agent.create({
            clientId,
            agentId,
            documentCollectionId,
            name: name || documentCollectionId
        });

        await client.save();
        return await successMessage(client);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgent(data, agentId) {
    try {
        const { newText, name, model, systemPrompt } = data;

        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }

        if (!newText && !name && !model && !systemPrompt) {
            return await errorMessage("At least one update parameter (newText or name) must be provided");
        }

        const agent = await Agent.findOne({ agentId });

        if (!agent) {
            return await errorMessage("Agent not found");
        }

        const collectionName = agent.documentCollectionId;
        let updated = false;

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

        if (updated) {
            await agent.save();
        }

        return await successMessage({
            message: "Agent updated successfully",
            agentId,
            collectionName,
            name: agent.name,
            textUpdated: Boolean(newText),
            nameUpdated: Boolean(name)
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

        if (!clientId || typeof clientId !== 'string') {
            return await errorMessage("Invalid client ID");
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



async function getAgentDetails(agentId) {
    try {
        const agent = await Agent.findOne({ agentId });
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
            await Chat.create({ userId: userId, sessionId: sessionId, agentId: agentId, userLogs: newUserLog, content: content });
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


export { signUpClient, addAgent, getAgents, updateAgent, createNewAgent, queryDocument, getAgentDetails, deleteAgent, updateUserLogs, getChatLogs, getAgentChatLogs }; 