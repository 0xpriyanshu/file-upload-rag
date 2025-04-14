import Client from "../models/ClientModel.js";
import { generateAgentId } from "../utils/utils.js";

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
            return  await successMessage(client);
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
            name: agent.documentCollectionId, 
            agentId: agent.agentId
        }));
        
        return await successMessage(agentsInfo);
    } catch (error) {
        return await errorMessage(error.message);
    }
}

export { signUpClient, addAgent, getAgents };


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

export { signUpClient, addAgent };
