import { v4 as uuidv4 } from 'uuid';
import Agent from '../models/AgentModel.js';
import Client from '../models/ClientModel.js';
import config from '../config.js';

/**
 * Generates a unique collection name with a given prefix.
 * @param {string} [prefix='collection'] - The prefix for the collection name.
 * @returns {string} A unique collection name.
 * @throws {Error} If the prefix is invalid.
 */
const generateUniqueCollectionName = (prefix = 'collection') => {
  validateInput(prefix, 'string', 'Prefix must be a non-empty string');
  return `${prefix}_${Date.now()}`;
};

/**
 * Validates input based on expected type.
 * @param {*} input - The input to validate.
 * @param {string} expectedType - The expected type of the input.
 * @param {string} errorMessage - The error message to throw if validation fails.
 * @throws {Error} If the input is invalid.
 */
const validateInput = (input, expectedType, errorMessage) => {
  if (expectedType === 'string' && (typeof input !== 'string' || input.trim() === '')) {
    throw new Error(errorMessage);
  }
  if (expectedType === 'array' && (!Array.isArray(input) || input.length === 0)) {
    throw new Error(errorMessage);
  }
  // Add more type checks as needed
};

/**
 * Handles errors by logging and throwing a new error with additional context.
 * @param {string} context - The context in which the error occurred.
 * @param {Error} error - The original error.
 * @returns {Error} A new error with additional context.
 */
 const handleError = (context, error) => {
  console.error(`${context}:`, error);
  if (error && error.message) {
    return new Error(`${context}: ${error.message}`);
  } else {
    return new Error(`${context}: ${error}`);
  }
};


async function generateAgentId() {
  const agentId = uuidv4();
  return agentId;
}

async function checkAgentLimit(clientId) {
  const client = await Client.findOne({ _id: clientId });
  if (!client) {
    throw new Error('Client not found');
  }
  const plan = config.PLANS.find(plan => plan.name === client.planId);
  if (!plan) {
    throw new Error('Plan not found');
  }
  const agentCount = await Agent.countDocuments({ clientId: client._id });
  if (agentCount >= plan.agentLimit) {
    throw new Error('Agent limit reached');
  }
  return true;
}

export { generateUniqueCollectionName, validateInput, handleError, generateAgentId, checkAgentLimit };