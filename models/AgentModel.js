import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true,
    },
    agentId: {
        type: String,
        required: true,
    },
    documentCollectionId: {
        type: String,
        required: true,
    },
    model: {
        type: String,
        required: true,
        default: "gpt-4o-mini"
    },
    systemPrompt: {
        type: String,
        required: true,
        default: "You are a concise AI assistant. Use the provided context to answer the user's question when relevant. If the context doesn't contain the answer or if the query is conversational, respond appropriately.\nRules:\n- Answer in 1-2 plain sentences only.\n- Do not add extra explanation, greetings, or conclusions.\n- No special characters, markdown, or formatting."
    },
    name: {
        type: String,
        required: true,
        default: "Agent"
    },
    username: {
        type: String,
        required: false,
        default: ""
    },
    metadata: {
        type: Object,
        required: true,
        default: {}
    },
    personalityType: {
        type: String,
        enum: ['influencer', 'professional', 'friendly', 'expert', 'motivational', 'casual', 'custom', 'neutral'],
        default: 'professional'
    },
    isCustomPersonality: {
        type: Boolean,
        default: false
    },
    customPersonalityPrompt: {
        type: String,
        required: false,
        default: ""
    },
    logo: {
        type: String,
        required: false,
        default: ""
    },
    personalityAnalysis: {
        type: {
            dominantTrait: String,
            confidence: Number,
            briefDescription: String,
            speechPatterns: [String],
            vocabularyStyle: String,
            sentenceStructure: String,
            emotionalTone: String,
            uniqueMannerisms: String,
            mimicryInstructions: String
        },
        required: false,
        default: null
    },
    calendlyUrl: {
        type: String,
        required: false,
        default: ""
    },
    lastPersonalityUrl: {
        type: String,
        required: false,
        default: ""
    },
    lastPersonalityContent: {
        type: String,
        required: false,
        default: ""
    }
});

const Agent = mongoose.model("Agent", AgentSchema, "Agent");

export default Agent;
