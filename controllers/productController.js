import Product from "../models/ProductModel.js";
import { errorMessage, successMessage } from "./clientController.js";



export const getProducts = async (agentId) => {
    const products = await Product.find({ agentId: agentId });
    return products;
};

export const updateProduct = async (updatedData, productId) => {
    const product = await Product.findOneAndUpdate({ _id: productId }, updatedData, { new: true });
    return product;
};




