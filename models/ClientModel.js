import mongoose from "mongoose";

const ClientSchema = new mongoose.Schema({
  signUpVia: {
    type: Object,
    required: true,
  },
  agents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  }]
});

const Client = mongoose.model("Client", ClientSchema, "Client");

export default Client;