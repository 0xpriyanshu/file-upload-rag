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
        default: 100
    },
    creditsPerMonthResetDate: {
        type: Date,
        default: null
    },
    planId: {
        type: String,
        default: 'FREE',
        enum: ['FREE', 'SOLOPRENEUR', 'PRO', 'BUSINESS']
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;