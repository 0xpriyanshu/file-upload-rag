import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
  signUpVia: {
    via: {
      type: String,
      required: true
    },
    handle: {
      type: String,
      required: true
    }
  },
  agents: [{
    name: String,
    agentId: String,
    username: String,
    logo: String
  }]
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;