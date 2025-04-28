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
        enum: ["GOOGLE_CALENDAR", "RAZORPAY", "STRIPE", "ZOHO_INVENTORY"]
    },
    isEnabled: {
        type: Boolean,
        default: true
    },
    credentials: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: () => new Map() 
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: () => new Map() 
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

ServiceSchema.index({ agentId: 1, serviceType: 1 }, { unique: true });

ServiceSchema.pre('save', function(next) {
    this.lastUpdatedAt = new Date();
    next();
});

ServiceSchema.methods.getCredential = function(key) {
    return this.credentials.get(key);
};

ServiceSchema.methods.setCredential = function(key, value) {
    this.credentials.set(key, value);
    return this;
};

ServiceSchema.methods.hasValidToken = function() {
    const accessToken = this.credentials.get('accessToken');
    const expiresAt = this.credentials.get('tokenExpiresAt');
    
    if (!accessToken || !expiresAt) return false;
    
    const now = new Date();
    const tokenExpiry = new Date(expiresAt);
    
    return tokenExpiry > now;
};

const Service = mongoose.model("Service", ServiceSchema, "Service");

export default Service;