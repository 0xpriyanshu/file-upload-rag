// controllers/formController.js
import EmailTemplates from '../models/EmailTemplates.js';
import Agent from '../models/AgentModel.js';

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

export const getEmailTemplates = async (agentId) => {
    try {
        let emailTemplates = await EmailTemplates.findOne({ agentId } );
        if (!emailTemplates) {
            emailTemplates = await EmailTemplates.create({ agentId });
        }

        return await successMessage(emailTemplates);

    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const updateEmailTemplates = async (body) => {
    try {
        const { agentId,updatedData } = body;

        // Remove fields that shouldn't be updated
        const updatedEmailTemplates = await EmailTemplates.findOneAndUpdate({ agentId }, { $set: updatedData }, { new: true }); 

        return await successMessage(updatedEmailTemplates);

    } catch (error) {
        return await errorMessage(error.message);
    }
};
