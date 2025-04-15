import mongoose from "mongoose";

const ChatLogsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true
    },
    sessionId: {
        type: String,
        required: true
    },
    agentId: {
        type: String,
        required: true
    },
    userLogs: {
        type: Array,
        required: true
    },
    content: {
        type: String,
        required: false
    },
    createdDate: {
        type: Date,
        required: true,
        default: Date.now()
    },
    lastUpdatedAt: {
        type: Date,
        required: true,
        default: Date.now()
    },
});

const ChatLogs = mongoose.model("ChatLogs", ChatLogsSchema, "ChatLogs");

export default ChatLogs;
