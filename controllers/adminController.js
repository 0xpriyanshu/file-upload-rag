import AdminChatLogs from "../models/AdminChatLogs.js";
import { errorMessage, successMessage } from "./clientController.js";

export const getSupportChatLogs = async () => {
    try {
        const chatLogs = await AdminChatLogs.find({ isActive: true }).sort({ createdDate: -1 });
        return await successMessage(chatLogs);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const updateChatLog = async (newUserLog, clientId) => {
    try {
        const chatLog = await AdminChatLogs.findOne({ clientId: clientId });
        if (!chatLog) {
            const chatTitle = newUserLog[0].content.split("\n")[0];
            await AdminChatLogs.create({ clientId: clientId, userLogs: newUserLog, chatTitle: chatTitle });
        }
        else {
            await AdminChatLogs.findOneAndUpdate({ clientId: clientId }, { $push: { "userLogs": { $each: newUserLog } } });
        }
        return await successMessage("Chat log updated successfully");
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getUserChatLogs = async (clientId) => {
    try {
        const chatLog = await AdminChatLogs.findOne({ clientId: clientId });
        if (!chatLog) {
            return await successMessage([]);
        }
        return await successMessage(chatLog.userLogs);
    } catch (error) {
        return await errorMessage(error.message);
    }
};