import mongoose from "mongoose";

const timeSlotSchema = new mongoose.Schema({
    startTime: {
        type: String,
        required: true
    },
    endTime: {
        type: String,
        required: true
    }
});

const dailyAvailabilitySchema = new mongoose.Schema({
    day: {
        type: String,
        enum: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        required: true
    },
    available: {
        type: Boolean,
        default: false
    },
    timeSlots: [timeSlotSchema]
});

const unavailableDateSchema = new mongoose.Schema({
    date: {
        type: String, 
        required: true
    },
    allDay: {
        type: Boolean,
        default: false
    },
    startTime: {
        type: String,
        required: false 
    },
    endTime: {
        type: String,
        required: false 
    },
    timeSlots: {
        type: [timeSlotSchema],
        default: []
    },
    timezone: {
        type: String,
        default: 'UTC'
    },
    isMultipleSlots: {
        type: Boolean,
        default: false
    },
    originalSlot: {
        startTime: String,
        endTime: String
    }
});

const AppointmentSettingsSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true,
        unique: true
    },
    bookingType: {
        type: String,
        enum: ['individual', 'group'],
        required: true
    },
    sessionType: {  
        type: String,
        default: 'Consultation'
    },
    bookingsPerSlot: {
        type: Number,
        required: true,
        min: 1
    },
    meetingDuration: {
        type: Number,
        required: true,
        min: 1
    },
    bufferTime: {
        type: Number,
        required: true,
        default: 0
    },
    breaks: {
        type: [timeSlotSchema],
        default: []
    },
    availability: [dailyAvailabilitySchema],
    unavailableDates: {
        type: [unavailableDateSchema],
        default: []
    },
    locations: [{
        type: String,
        enum: ['google_meet', 'in_person', 'zoom', 'teams']
    }],
    timezone: {
        type: String,
        default: 'UTC'
    },
    price: {
        isFree: {
            type: Boolean,
            default: false
        },
        amount: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: 'USD'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

const AppointmentSettings = mongoose.model("AppointmentSettings", AppointmentSettingsSchema);
export default AppointmentSettings;