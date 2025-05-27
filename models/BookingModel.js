import mongoose from "mongoose";

const BookingSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    contactEmail: {  
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    location: {
        type: String,
        enum: ['google_meet', 'in_person', 'zoom', 'teams'],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    },
    meetingLink: {
        type: String
    },
    userTimezone: {
        type: String,
        default: 'UTC'
    },
    sessionType: {
         type: String,
        default: 'Consultation'
    },
    notes: {
        type: String
    },
    name: {  
        type: String
    },
    phone: { 
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    paymentId: {
        type: String
    },
    paymentMethod: {
        type: String
    },
    paymentAmount: {
        type: Number
    },
    paymentCurrency: {
        type: String
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'completed', 'failed'],
        default: 'pending'
    },
    isRescheduled: {
        type: Boolean,
        default: false
    },
    rescheduledTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking'
    },
    rescheduledDate: {
        type: Date
    },
    rescheduledFrom: {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking'
        },
        date: Date,
        startTime: String,
        endTime: String
    },
    reminderSent: {
        type: Boolean,
        default: false
    },
    reminderSentAt: {
        type: Date
    }
});

BookingSchema.index({ agentId: 1, date: 1 });
BookingSchema.index({ userId: 1 });
BookingSchema.index({ paymentId: 1 });
BookingSchema.index({ reminderSent: 1, status: 1, location: 1, date: 1 });

const Booking = mongoose.model("Booking", BookingSchema);
export default Booking;