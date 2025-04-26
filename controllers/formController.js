// controllers/formController.js
import FormConfig from '../models/FormConfig.js';
import Agent from '../models/AgentModel.js';

export const createFormConfig = async (req) => {
    try {
        const { agentId, formName, description, inputs, submitButtonText, createdBy } = req.body;
        
        // Validate required fields
        if (!agentId || !formName || !inputs || !createdBy) {
            return { 
                error: true, 
                result: 'Missing required fields: agentId, formName, inputs, and createdBy are required' 
            };
        }
        
        // Validate agent exists
        const agent = await Agent.findOne({ agentId });
        if (!agent) {
            return { error: true, result: 'Agent not found' };
        }
        
        // Since only one form per agent, use findOneAndUpdate with upsert
        const formConfig = await FormConfig.findOneAndUpdate(
            { agentId },
            {
                agentId,
                formName,
                description,
                inputs,
                submitButtonText,
                createdBy,
                lastModifiedBy: createdBy
            },
            { new: true, upsert: true, runValidators: true }
        );
        
        return { error: false, result: formConfig };
        
    } catch (error) {
        if (error.code === 11000) {
            return { 
                error: true, 
                result: 'Form already exists for this agent' 
            };
        }
        return { error: true, result: error.message };
    }
};

export const updateFormConfig = async (req) => {
    try {
        const { agentId } = req.params;
        const updateData = req.body;
        
        // Remove fields that shouldn't be updated
        delete updateData.agentId;
        
        updateData.lastModifiedBy = req.body.modifiedBy || 'system';
        
        const updatedForm = await FormConfig.findOneAndUpdate(
            { agentId },
            { $set: updateData },
            { new: true, runValidators: true }
        );
        
        if (!updatedForm) {
            return { error: true, result: 'Form not found for this agent' };
        }
        
        return { error: false, result: updatedForm };
        
    } catch (error) {
        return { error: true, result: error.message };
    }
};

export const getFormConfig = async (req) => {
    try {
        const { agentId } = req.params;
        
        const form = await FormConfig.findOne({ agentId });
        
        if (!form) {
            return { error: true, result: 'Form not found for this agent' };
        }
        
        return { error: false, result: form };
        
    } catch (error) {
        return { error: true, result: error.message };
    }
};

export const deleteFormConfig = async (req) => {
    try {
        const { agentId } = req.params;
        
        const deletedForm = await FormConfig.findOneAndDelete({ agentId });
        
        if (!deletedForm) {
            return { error: true, result: 'Form not found for this agent' };
        }
        
        return { error: false, result: 'Form deleted successfully' };
        
    } catch (error) {
        return { error: true, result: error.message };
    }
};