import AdminChatLogs from "../models/AdminChatLogs.js";
import { errorMessage, successMessage } from "./clientController.js";

export const getAdminChatLogs = async () => {
    try {
        const chatLogs = await AdminChatLogs.find({ isActive: true });
        return await successMessage(chatLogs);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const updateChatLog = async (newUserLog, userId) => {
    try {
        const chatLog = await AdminChatLogs.findOne({ userId: userId });
        if (!chatLog) {
            const chatTitle = newUserLog[0].content.split("\n")[0];
            await AdminChatLogs.create({ userId: userId, userLogs: newUserLog, chatTitle: chatTitle }); 
        }
        else {
            await AdminChatLogs.findOneAndUpdate({ userId: userId }, { $push: { "userLogs": { $each: newUserLog } } });
        }
        return await successMessage("Chat log updated successfully");
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getUserChatLogs = async (userId) => {
    try {
        const chatLog = await AdminChatLogs.findOne({ userId: userId });
        if (!chatLog) {
            return await errorMessage("Chat log not found");
        }
        return await successMessage(chatLog);
    } catch (error) {
        return await errorMessage(error.message);
    }
};