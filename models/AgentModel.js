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
        default: "You are a helpful assistant."
    },
    name: {
        type: String,
        required: true,
        default: "Agent"
    },
    metadata: {
        type: Object,
        required: true,
        default: {}
    }
});

const Agent = mongoose.model("Agent", AgentSchema, "Agent");

export default Agent;
