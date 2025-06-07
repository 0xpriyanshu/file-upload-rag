import AdminChatLogs from "../models/AdminChatLogs.js";
import { wsManager } from "../connections/websocketManager.js";

const successMessage = async (data) => {
    const returnData = {};
    returnData["error"] = false;
    returnData["result"] = data;

    return returnData;
};

const errorMessage = async (data) => {
    const returnData = {};
    returnData["error"] = true;
    returnData["result"] = data;

    return returnData;
};

export const getSupportChatLogs = async () => {
    try {
        wsManager.sendToClient('1234567890', {
            type: "chatUpdated",
            data: {
                message: "Hello WS!"
            }
        });
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
        wsManager.sendToClient(clientId, {
            type: "chatUpdated",
            data: {
                message: newUserLog[0]
            }
        });
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