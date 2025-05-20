import mongoose from "mongoose";

const SubscriptionSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
    },
    subscriptionDetails: {
        type: Object,
        default: {}
    }
});

const Subscription = mongoose.model("Subscription", SubscriptionSchema, "Subscription");

export default Subscription;