import mongoose from "mongoose";

const OrderSchema = new mongoose.Schema({
    user: {
        type: String,
        ref: "User",
    },
    userEmail: {
        type: String,
        default: "",
    },
    orderId: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ["PROCESSING", "COMPLETED"],
        default: "PROCESSING",
    },
    items: {
        type: Array,
        default: {},
    },
    totalAmount: {
        type: Number,
        default: 0,
    },
    currency: {
        type: String,
        default: "USD",
    },
    paymentStatus: {
        type: String,
        enum: ["succeeded", "failed", "requires_payment_method"],
        default: "requires_payment_method",
    },
    paymentMethod: {
        type: String,
        enum: ["CRYPTO", "FIAT", "CASH"],
        default: "FIAT",
    },
    paymentId: {
        type: String,
        default: "",
    },
    agentId: {
        type: String,
        default: "",
    },
});


const OrderModel = mongoose.model("Order", OrderSchema, "Order");


OrderModel.generateOrderId = async function () {
    const lastOrder = await this.findOne().sort({ orderId: -1 });
    const nextOrderId = lastOrder ? parseInt(lastOrder.orderId) + 1 : 10000;
    return nextOrderId
};

export default OrderModel;
