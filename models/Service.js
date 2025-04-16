import mongoose from "mongoose";

const ServiceSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true
    },
    clientId: {
        type: String,
        required: true
    },
    serviceType: {
        type: String,
        required: true,
        enum: ["GOOGLE_CALENDAR", "RAZORPAY", "STRIPE"]
    },
    isEnabled: {
        type: Boolean,
        default: true
    },
    credentials: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdDate: {
        type: Date,
        default: Date.now
    },
    lastUpdatedAt: {
        type: Date,
        default: Date.now
    }
});

// Create indexes for faster queries
ServiceSchema.index({ seller: 1, serviceType: 1 }, { unique: true });

const Service = mongoose.model("Service", ServiceSchema, "Service");

export default Service; 