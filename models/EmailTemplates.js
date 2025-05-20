// models/EmailTemplates.js
import mongoose from 'mongoose';

// Helper function to create template schema object
const createTemplateObject = (defaultSubText) => ({
  type: Object,
  subText: {
    type: String,
    default: defaultSubText
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
  default: {
    subText: defaultSubText,
    isActive: false,
    subject: '',
    body: ''
  }
});

const emailTemplateSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true
  },
  // Product email templates
  physicalProduct: createTemplateObject('Product Order Confirmation'),
  digitalProduct: createTemplateObject('Digital Product Confirmation'),
  Service: createTemplateObject('Service Confirmation'),
  Event_Booking_Confirmation: createTemplateObject('Event Registration Confirmation'),
  Event_Booking_Cancellation: createTemplateObject('Event Registration Cancellation'),
  
  // Booking email templates
  Calender_Booking_Confirmation: createTemplateObject('Appointment Confirmation'),
  Calender_Booking_Cancellation: createTemplateObject('Appointment Cancellation'),
  Calender_Booking_Reschedule: createTemplateObject('Appointment Reschedule'),
  
  // These are temporarily disabled but kept in the schema for future use
  Calender_Booking_Reminder: createTemplateObject('Appointment Reminder'),
  Event_Booking_Reminder: createTemplateObject('Event Reminder')
});

const EmailTemplates = mongoose.model('EmailTemplates', emailTemplateSchema);
export default EmailTemplates;