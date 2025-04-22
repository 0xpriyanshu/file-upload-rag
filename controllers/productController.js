import Product from "../models/ProductModel.js";
import { errorMessage, successMessage } from "./clientController.js";
import UserModel from "../models/User.js";
import OrderModel from "../models/OrderModel.js";

export const getProducts = async (agentId) => {
    const products = await Product.find({ agentId: agentId });
    return products;
};

export const updateProduct = async (updatedData, productId) => {
    const product = await Product.findOneAndUpdate({ _id: productId }, updatedData, { new: true });
    return product;
};


export const createUserOrder = async (body) => {
    try {
        let userData = await UserModel.findOne({
            "_id": body.userId,
        });
        if (!userData) {
            throw {
                message: "User not found",
            };
        }
        const order = await OrderModel.create({
            user: userData._id,
            items: body.items,
            orderId: body.orderId,
            totalAmount: body.totalAmount,
            currency: body.currency.toUpperCase(),
            paymentStatus: body.paymentStatus,
            paymentId: body.paymentId,
            status: "PROCESSING",
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        return await successMessage(true);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}


export const generateOrderId = async () => {
    return await OrderModel.generateOrderId();
}