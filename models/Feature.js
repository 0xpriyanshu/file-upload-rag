import mongoose from "mongoose";

const FeatureSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true
    },
    featureType: {
        type: String,
        required: true,
        enum: ["PRODUCT", "LEADS", "BOOKING", "LINKS"]
    },
    isEnabled: {
        type: Boolean,
        default: true
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

FeatureSchema.index({ agentId: 1, featureType: 1 }, { unique: true });

FeatureSchema.pre('save', function(next) {
    this.lastUpdatedAt = new Date();
    next();
});

const Feature = mongoose.model("Feature", FeatureSchema, "Feature");

export default Feature;