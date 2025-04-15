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
        default: "You are a concise AI assistant. Use only the provided context to answer the user's question.\nRules:\n- Answer in 1–2 plain sentences only.\n- Do not add extra explanation, greetings, or conclusions.\n- No special characters, markdown, or formatting.\n- If the context doesn't contain the answer, reply: No relevant info found."
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
