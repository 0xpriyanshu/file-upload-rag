import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
    signUpVia: {
        type: Object,
        required: true,
    },
    availableCredits: {
        type: Number,
        default: 100
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
        default: 'STARTER',
        enum: ['STARTER', 'SOLO', 'PRO', 'BUSINESS', 'SOLO(YEARLY)', 'PRO(YEARLY)', 'BUSINESS(YEARLY)']
    },
    billingDetails: {
        type: Object,
        required: false,
        default: {
            "Individual/Organization Name": "",
            "Email": "",
            "Country": "",
            "State": "",
            "Zip Code": "",
            "Address Line 1": "",
            "Address Line 2": ""
        }
    },
    stripeCustomerId: {
        type: String,
        default: ""
    },
    billingMethod: {
        type: Array,
        default: []
    },
    stripeCustomerId: {
        type: String,
        default: ""
    },
    stripeCustomerProfile: {
        type: Object,
        default: {}
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;