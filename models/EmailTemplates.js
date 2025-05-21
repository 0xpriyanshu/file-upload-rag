// models/EmailTemplates.js
import mongoose from 'mongoose';

// Helper function to create template schema object
const createTemplateObject = (defaultSubText, subject, body1, body3) => ({
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
    default: subject
  },
  body1: {
    type: String,
    default: body1
  },
  body2: {
    type: String,
    default: ''
  },
  body3: {
    type: String,
    default: body3
  },
  default: {
    subText: defaultSubText,
    isActive: false,
    subject: '',
    body1: body1,
    body2: '',
    body3: body3
  }
});

const emailTemplateSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true
  },
  // Product email templates
  physicalProduct: createTemplateObject('Product Order Confirmation', `Your Order for {PRODUCT} has been successfully placed`, `Dear {{name}},

Thank you for your order! We're excited to confirm that your purchase has been successfully processed.`, `Thank you for choosing our store!

Best regards,
The Team`),
  digitalProduct: createTemplateObject('Digital Product Confirmation', `Your Order for {PRODUCT} has been successfully received`,`Dear {{name}},

Thank you for your purchase! Your digital product is ready for download.

You can download your purchase using the link below:
{{fileUrl}}`,`The download link will remain active for 30 days. If you have any questions or need assistance, please reach out to our support team.

Thank you for your business!

Best regards,
The Team`),
  // Service: createTemplateObject('Service Confirmation'),
  // Event_Booking_Confirmation: createTemplateObject('Event Registration Confirmation'),
  // Event_Booking_Cancellation: createTemplateObject('Event Registration Cancellation'),

  // // Booking email templates
  // Calender_Booking_Confirmation: createTemplateObject('Appointment Confirmation'),
  // Calender_Booking_Cancellation: createTemplateObject('Appointment Cancellation'),
  // Calender_Booking_Reschedule: createTemplateObject('Appointment Reschedule'),

  // // These are temporarily disabled but kept in the schema for future use
  // Calender_Booking_Reminder: createTemplateObject('Appointment Reminder'),
  // Event_Booking_Reminder: createTemplateObject('Event Reminder')
});

const EmailTemplates = mongoose.model('EmailTemplates', emailTemplateSchema);
export default EmailTemplates;