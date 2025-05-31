import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
    orderId: {
        type: String,
        ref: "Order"
    },
    amount: {
        type: String,
        required: false
    },
    createdDate: {
        type: Date,
        required: true,
        default: Date.now()
    },
    status: {
        type: String,
        required: true,
        enum: [
            "PENDING",
            "COMPLETED",
            "FAILED"
        ],
        default: "PENDING"
    },
    txHash: {
        type: String,
        required: true,
        unique: true
    },
    chainId: {
        type: String,
        required: false
    },
    toAddress: {
        type: String,
        required: false
    },
    fromAddress: {
        type: String,
        required: false
    },
    currency: {
        type: String,
        required: false,
        default: "USDT"
    }
});

const TransactionModel = mongoose.model("Transaction", TransactionSchema);


export default TransactionModel;