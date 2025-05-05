import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
    signUpVia: {
        type: Object,
        required: true,
    },
    availableCredits: {
        type: Number,
        default: 0
    },
    creditsPerMonth: {
        type: Number,
        default: 0
    },
    creditsPerMonthResetDate: {
        type: Date,
        default: null
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;