import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
  signUpVia: {
    type: Object,
    required: true,
  },
  agents: {
    type: Array,
    default: []
  }
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;