import Client from "../models/ClientModel.js";
import { generateAgentId } from "../utils/utils.js";
import { processDocument } from "../utils/documentProcessing.js";

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
        
        const agentsInfo = client.agents.map(agent => ({
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
        
        const agent = {
            agentId,
            documentCollectionId,
            name: name || documentCollectionId 
        };
        
        client.agents.push(agent);
        await client.save();
        return await successMessage(client);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

async function updateAgent(data) {
    try {
        const { agentId, newText, name } = data;
        
        if (!agentId || typeof agentId !== 'string') {
            return await errorMessage("Invalid agent ID");
        }
        
        if (!newText && !name) {
            return await errorMessage("At least one update parameter (newText or name) must be provided");
        }
        
        const client = await Client.findOne({ "agents.agentId": agentId });
        
        if (!client) {
            return await errorMessage("Agent not found");
        }
        
        const agentIndex = client.agents.findIndex(a => a.agentId === agentId);
        
        if (agentIndex === -1) {
            return await errorMessage("Agent not found");
        }
        
        const agent = client.agents[agentIndex];
        const collectionName = agent.documentCollectionId;
        let updated = false;
        
        if (name && typeof name === 'string' && name.trim() !== '') {
            client.agents[agentIndex].name = name.trim();
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
        
        if (updated && name) {
            await client.save();
        }
        
        return await successMessage({
            message: "Agent updated successfully",
            agentId,
            collectionName,
            name: client.agents[agentIndex].name,
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

        const newAgentId = agentResponse.result.agents[agentResponse.result.agents.length - 1].agentId;
        
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

export { signUpClient, addAgent, getAgents, updateAgent, createNewAgent };