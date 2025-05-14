// models/FormConfig.js
import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
    agentId: {
        type: String,
        required: true
    },
    physicalProduct: {
        type: Object,
        subText: {
            type: String,
            default: 'Confirmation Email'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Confirmation Email',
            isActive: false,
            subject: '',
            body: ''
        }
    },
    digitalProduct: {
        type: Object,
        subText: {
            type: String,
            default: 'Confirmation Email'
        }, 
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Confirmation Email',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Service: {
        type: Object,
        subText: {
            type: String,
            default: 'Cancellation Email'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Cancellation Email',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Event_Booking_Confirmation: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Confirmation'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Confirmation',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Event_Booking_Reminder: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Reminder'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Reminder',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Event_Booking_Cancellation: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Cancellation'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Cancellation',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Calender_Booking_Confirmation: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Confirmation'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Confirmation',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Calender_Booking_Reminder: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Reminder'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Cancellation',
            isActive: false,
            subject: '',
            body: ''
        }
    }, Calender_Booking_Cancellation: {
        type: Object,
        subText: {
            type: String,
            default: 'Booking Cancellation'
        },
        isActive: {
            type: Boolean,
            default: false
        },
        subject: {
            type: String,
            default: ''
        },
        body: {
            type: String,
            default: ''
        },
        default:{
            subText: 'Booking Cancellation',
            isActive: false,
            subject: '',
            body: ''
        }
    },
});

const EmailTemplates = mongoose.model('EmailTemplates', emailTemplateSchema);
export default EmailTemplates;