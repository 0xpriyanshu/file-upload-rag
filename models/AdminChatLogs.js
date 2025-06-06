import mongoose from "mongoose";

const AdminChatLogsSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true
    },
    chatTitle: {
        type: String,
        required: false
    },
    userLogs: {
        type: Array,
        required: true
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
    isActive: {
        type: Boolean,
        required: true,
        default: true
    }
});

const AdminChatLogs = mongoose.model("AdminChatLogs", AdminChatLogsSchema, "AdminChatLogs");

export default AdminChatLogs;
