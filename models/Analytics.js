import mongoose from "mongoose";

const AnalyticsSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true,
    },
    totalIncome: {
        type: Number,
        default: 0
    },
    dailyIncome: {
        type: Object,
        default: {}
    },
    ordersReceived: {
        type: Number,
        default: 0
    },
    leadsReceived: {
        type: Number,
        default: 0
    },
    bookingsReceived: {
        type: Number,
        default: 0
    }
});

const Analytics = mongoose.model("Analytics", AnalyticsSchema, "Analytics");

export default Analytics;
