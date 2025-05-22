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
        let emailTemplates = await EmailTemplates.findOne({ agentId });
        if (!emailTemplates) {
            emailTemplates = await EmailTemplates.create({ agentId });
        }
        emailTemplates = emailTemplates.toObject();
        delete emailTemplates._id;
        delete emailTemplates.__v;
        delete emailTemplates.agentId;
        return await successMessage(emailTemplates);

    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const updateEmailTemplates = async (body) => {
    try {
        const { agentId, updatedData, emailTemplateId } = body;

        // Remove fields that shouldn't be updated
        let updateData = {};
        updateData[emailTemplateId] = updatedData;
        const updatedEmailTemplates = await EmailTemplates.findOneAndUpdate({ agentId }, { $set: updateData }, { new: true }).lean();
        delete updatedEmailTemplates._id;
        delete updatedEmailTemplates.__v;
        delete updatedEmailTemplates.agentId;

        return await successMessage(updatedEmailTemplates);

    } catch (error) {
        return await errorMessage(error.message);
    }
};
