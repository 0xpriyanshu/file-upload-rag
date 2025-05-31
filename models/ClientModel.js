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
    stripeCustomerId: {
        type: String,
        default: ""
    },
    stripeCustomerProfile: {
        type: Object,
        default: {}
    },
    paymentMethods: {
        stripe: {
            enabled: {
                type: Boolean,
                default: false
            },
            isActivated: {
                type: Boolean,
                default: false
            },
            accountId: {
                type: String,
                default: ""
            }
        },
        razorpay: {
            enabled: {
                type: Boolean,
                default: false
            },
            accountId: {
                type: String,
                default: ""
            }
        },
        crypto: {
            enabled: {
                type: Boolean,
                default: false
            },
            walletAddress: {
                type: String,
                default: ""
            }
        }
    },
    currency: {
        type: String,
        default: "USD",
        enum: ["USD", "INR", 'AED', 'EUR', 'GBP']
    },
    preferredMethod: {
        type: String,
        default: "stripe",
        enum: ["crypto", "stripe", "razorpay"]
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;