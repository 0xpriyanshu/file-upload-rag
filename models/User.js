import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    signUpVia: {
        type: Object,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    shipping: {
        type: Object,
        default: {}
    }
});

const User = mongoose.model("User", UserSchema);
export default User; 