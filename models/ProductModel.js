// models/ProductModel.js
import mongoose from "mongoose";

const SlotSchema = new mongoose.Schema({
    date: { type: Date },
    start: { type: String },
    end: { type: String },
    seats: { type: Number },
    seatType: { type: String, enum: ['unlimited', 'limited'] }
}, { _id: false });

const SizeSchema = new mongoose.Schema({
    S: { type: Number },
    M: { type: Number },
    L: { type: Number },
    XL: { type: Number }
}, { _id: false });

const ProductSchema = new mongoose.Schema({
    // Common fields
    productId: { type: Number, required: true },
    type: { type: String, required: true, enum: ['Event', 'Service', 'digitalProduct', 'physicalProduct'] }, // 'event', 'service', 'digital', 'physical'
    title: { type: String, required: true },
    agentId: { type: String, required: true },
    category: { type: String },
    description: { type: String },
    images: [{ type: String }],
    price: { type: Number, default: 0 },
    priceType: { type: String, enum: ['free', 'paid'] },
    ctaButton: { type: String, required: true },
    // Event-specific
    eventType: { type: String },
    otherEventType: { type: String },
    timeZone: { type: String },
    slots: [SlotSchema],

    limitedSeats: { type: Number },
    // Service-specific
    quantityUnlimited: { type: Boolean },
    quantity: { type: Number, default: 0 },
    locationType: { type: String, enum: ['online', 'offline'] }, // 'online' or 'offline'
    address: { type: String },
    // Digital product-specific
    fileFormat: [{ type: String, enum: ['.doc', '.xls', '.pdf', '.zip', '.psd', '.eps', '.svg', '.mp4'], required: false }],
    uploadType: { type: String, enum: ['upload', 'redirect'] }, // 'upload' or 'redirect'
    fileUrl: { type: String },
    // Physical product-specific
    variedQuantities: SizeSchema,
    // Common for digital/physical
    quantityType: { type: String, enum: ['unlimited', 'oneSize', 'variedSizes'] }, // 'unlimited', 'oneSize', 'variedSizes'
    // Metadata
    createdAt: { type: Date, default: Date.now },
    isPaused: { type: Boolean, default: false },
    checkOutCustomerDetails: { type: Array, default: [] }
});



const Product = mongoose.model("Product", ProductSchema, "Product");

Product.generateProductId = async function () {
    const lastProduct = await this.findOne().sort({ productId: -1 });
    const nextProductId = lastProduct ? parseInt(lastProduct.productId) + 1 : 100;
    return nextProductId
};

export default Product;