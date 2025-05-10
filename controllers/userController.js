import User from "../models/User.js";
import { errorMessage, successMessage } from "./clientController.js";
import OrderModel from "../models/OrderModel.js";
import Product from "../models/ProductModel.js";

export const signUpUser = async (via, handle) => {
    try {
        const user = await User.create({ signUpVia: { via, handle } });
        return await successMessage(user);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getUserDetails = async (userId) => {
    try {
        const user = await User.findOne({ _id: userId });
        return await successMessage(user);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getUserOrders = async (userId) => {
    try {
        const user = await User.findOne({ _id: userId });
        if (!user) {
            return await errorMessage("User not found");
        }
        const orders = await OrderModel.find({ user: user._id }).sort({ createdAt: -1 });
        return await successMessage(orders);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getAgentProducts = async (agentId) => {
    try {
        const products = await Product.find({ agentId: agentId, isPaused: false });
        return await successMessage(products);
    } catch (error) {
        return await errorMessage(error.message);
    }
};
