import mongoose from "mongoose";

const TokenUsageSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
    },
    totalTokensUsed: {
        type: Number,
        default: 0
    },
    date: {
        type: String,
        default: ""
    }
});

const TokenUsage = mongoose.model("TokenUsage", TokenUsageSchema, "TokenUsage");

export default TokenUsage;