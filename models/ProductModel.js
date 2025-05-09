// models/ProductModel.js
import mongoose from "mongoose";

const SlotSchema = new mongoose.Schema({
    date: { type: String },
    start: { type: String },
    end: { type: String },
    slotsPerSession: { type: Number }
}, { _id: false });

const SizeSchema = new mongoose.Schema({
    S: { type: Number },
    M: { type: Number },
    L: { type: Number },
    XL: { type: Number }
}, { _id: false });

const ProductSchema = new mongoose.Schema({
    // Common fields
    type: { type: String, required: true, enum: ['event', 'service', 'digital', 'physical'] }, // 'event', 'service', 'digital', 'physical'
    name: { type: String, required: true },
    agentId: { type: String, required: true },
    category: { type: String },
    description: { type: String },
    images: [{ type: String }],
    price: { type: Number, default: 0 },
    ctaButton: { type: String, required: true },
    // Event-specific
    eventType: { type: String },
    otherEventType: { type: String },
    timeZone: { type: String },
    slots: [SlotSchema],
    unlimitedSlots: { type: Boolean },
    limitedSeats: { type: Number },
    // Service-specific
    quantityUnlimited: { type: Boolean },
    quantity: { type: Number },
    locationType: { type: String, enum: ['online', 'offline'] }, // 'online' or 'offline'
    address: { type: String },
    // Digital product-specific
    fileFormat: [{ type: String, enum: ['.doc', '.xls', '.pdf', '.zip', '.psd', '.eps', '.svg', '.mp4'] }],
    uploadType: { type: String, enum: ['upload', 'redirect'] }, // 'upload' or 'redirect'
    fileUrl: { type: String },
    // Physical product-specific
    variedSizes: SizeSchema,
    // Common for digital/physical
    quantityType: { type: String, enum: ['unlimited', 'oneSize', 'variedSizes'] }, // 'unlimited', 'oneSize', 'variedSizes'
    // Metadata
    createdAt: { type: Date, default: Date.now },
    isPaused: { type: Boolean, default: false }
});

const Product = mongoose.model("Product", ProductSchema, "Product");

export default Product;