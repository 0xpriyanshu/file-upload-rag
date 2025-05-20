import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema({
    customerId: {
        type: String,
        required: true,
    },
    subscriptionId: {
        type: String,
        required: true,
    },
    invoiceId: {
        type: String,
        required: true,
    },
    invoiceDetails: {
        type: Object,
        default: {}
    }
});

const Invoice = mongoose.model("Invoice", InvoiceSchema, "Invoice");

export default Invoice;