import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
    signUpVia: {
        type: Object,
        required: true,
    },
    agents: [{
        agentId: {
            type: String,
            required: true
        },
        documentCollectionId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        }
    }]
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;