import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
    signUpVia: {
        type: Object,
        required: true,
    }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;