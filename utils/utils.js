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
  
  let errorMessage;
  
  if (error && error.message) {
    errorMessage = error.message;
  } else if (error && typeof error === 'object') {
    try {
      errorMessage = JSON.stringify(error);
    } catch (jsonError) {
      errorMessage = "Unknown error object that cannot be stringified";
    }
  } else if (error) {
    errorMessage = String(error);
  } else {
    errorMessage = "Unknown error";
  }
  
  return new Error(`${context}: ${errorMessage}`);
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


async function getDateFormat() {
  let now = Date.now()
  const date = new Date(now);
  let day = date.getDate();
  let month = date.getMonth() + 1; // getMonth() returns months from 0-11, so we add 1
  const year = date.getFullYear();

  // Format day and month to 2 digits
  day = day < 10 ? '0' + day : day;

  let months = {
    1: 'JAN',
    2: 'FEB',
    3: 'MAR',
    4: 'APR',
    5: 'MAY',
    6: 'JUN',
    7: 'JUL',
    8: 'AUG',
    9: 'SEP',
    10: 'OCT',
    11: 'NOV',
    12: 'DEC'
  };

  month = months[month]

  let dateformat = `${day}${month}${year}`;
  return dateformat
}

export { generateUniqueCollectionName, validateInput, handleError, generateAgentId, checkAgentLimit };