import mongoose from "mongoose";

const AgentSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
    },
   documentCollectionId: {
    type: String,
    required: true,
   },
   metadata: {
    type: Object,
    required: true,
    default: {}
   }
});

const Agent = mongoose.model("Agent", AgentSchema, "Agent");

export default Agent;
