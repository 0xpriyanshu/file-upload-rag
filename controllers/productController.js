import Product from "../models/ProductModel.js";
import UserModel from "../models/User.js";
import OrderModel from "../models/OrderModel.js";


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

export const addProduct = async (body, images, productUrl, productId) => {
    try {
        if (body.slots) {
            body.slots = JSON.parse(body.slots);
        }
        if (body.variedQuantities) {
            body.variedQuantities = JSON.parse(body.variedQuantities);
        }
        const product = await Product.create({
            ...body,
            images: images,
            fileUrl: productUrl,
            productId: productId
        });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const getProducts = async (agentId) => {
    const products = await Product.find({ agentId: agentId });
    return products;
};

export const updateProduct = async (updatedData, productId) => {
    try {
        if (updatedData.variedQuantities) {
            updatedData.variedQuantities = JSON.parse(updatedData.variedQuantities);
        }
        const product = await Product.findOneAndUpdate({ _id: productId }, updatedData, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
};

export const pauseProduct = async (productId, isPaused) => {
    try {
        const product = await Product.findOneAndUpdate({ _id: productId }, { isPaused: isPaused }, { new: true });
        return await successMessage(product);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}


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
            agentId: body.agentId,
            status: "PROCESSING",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            userEmail: body.userEmail,
        });

        return await successMessage(true);
    } catch (err) {
        throw await errorMessage(err.message);
    }
}


export const generateOrderId = async () => {
    return await OrderModel.generateOrderId();
}

export const generateProductId = async () => {
    return await Product.generateProductId();
}


export const updateUserOrder = async (paymentId, paymentStatus, status) => {
    try {
        const order = await OrderModel.findOneAndUpdate({ paymentId: paymentId }, { paymentStatus: paymentStatus, status: status }, { new: true });
        return true;
    } catch (err) {
        throw await errorMessage(err.message);
    }
}

