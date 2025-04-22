import User from "../models/User.js";
import { errorMessage, successMessage } from "./clientController.js";


export const signUpUser = async (req) => {
    try {
        const {via, handle} = req.body;
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




