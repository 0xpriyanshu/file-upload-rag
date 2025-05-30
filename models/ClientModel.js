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
        usdt: {
            enabled: {
                type: Boolean,
                default: false
            },
            walletAddress: {
                type: String,
                default: ""
            },
            chains: {
                type: [String],
                default: []
            }
        },
        usdc: {
            enabled: {
                type: Boolean,
                default: false
            },
            walletAddress: {
                type: String,
                default: ""
            },
            chains: {
                type: [String],
                default: []
            }
        }
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;