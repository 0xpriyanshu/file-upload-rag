import mongoose from "mongoose";

const SocialHandleSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true
    },
    instagram: {
        type: String,
        default: ""
    },
    tiktok: {
        type: String,
        default: ""
    },
    twitter: {
        type: String,
        default: ""
    },
    facebook: {
        type: String,
        default: ""
    },
    youtube: {
        type: String,
        default: ""
    },
    linkedin: {
        type: String,
        default: ""
    },
    snapchat: {
        type: String,
        default: ""
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

SocialHandleSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

SocialHandleSchema.index({ agentId: 1 }, { unique: true });

const SocialHandle = mongoose.model("SocialHandle", SocialHandleSchema, "SocialHandles");

export default SocialHandle;