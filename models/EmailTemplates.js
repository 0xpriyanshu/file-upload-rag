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
    subject: subject,
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
  physicalProduct: createTemplateObject('Product Order Confirmation', `Your order for {{productTitle}} has been successfully placed`, `Dear {{name}},

Thank you for your order (orderNo:{{orderId}})! We're excited to confirm that your purchase has been successfully processed.`, `Thank you for choosing our store!

Best regards,
The Team`),
  digitalProduct: createTemplateObject('Digital Product Confirmation', `Your order for {{productTitle}} has been successfully received`, `Dear {{name}},

Thank you for your purchase (orderNo:{{orderId}})! Your digital product is ready for download.

You can download your purchase using the link below:
{{fileUrl}}`, `The download link will remain active for 30 days. If you have any questions or need assistance, please reach out to our support team.

Thank you for your business!

Best regards,
The Team`),


  //   const defaultTemplates = {
  //     physicalProduct: {
  //       subject: "Your Order for {PRODUCT} has been successfully placed",
  //       body1: `Dear {{name}},

  // Thank you for your order! We're excited to confirm that your purchase has been successfully processed.
  // `,
  //       body2: "",
  //       body3: `Thank you for choosing our store!

  // Best regards,
  // The Team`,
  //     },

  //     digitalProduct: {
  //       subject: "Your Digital Product Order for {PRODUCT}",
  //       body1: `Dear {{name}},

  // Thank you for your purchase! Your digital product is ready for download.

  // You can download your purchase using the link below:
  // {{fileUrl}}`,
  //       body2: "",
  //       body3: `The download link will remain active for 30 days. If you have any questions or need assistance, please reach out to our support team.

  // Thank you for your business!

  // Best regards,
  // The Team`,
  //     },

  //     Service: {
  //       subject: "Your Service Order for {PRODUCT}",
  //       body1: `Dear {{name}},

  // Thank you for your order! We're pleased to confirm that your service booking has been successfully processed.


  // Our team will contact you shortly to coordinate the details of your service.`,
  //       body2: "",
  //       body3: `If you have any questions in the meantime, please don't hesitate to reach out to our customer service team.

  // Thank you for choosing our services!

  // Best regards,
  // The Team`,
  //     },

  //     Event_Booking_Confirmation: {
  //       subject: "Your Event Registration for {PRODUCT} is Confirmed",
  //       body1: `Dear {{name}},

  // Thank you for registering for our upcoming event!

  // ORDER SUMMARY:
  // Event: {{productTitle}}
  // Order ID: {{orderId}}
  // Amount: {{totalAmount}}
  // Payment Method: {{paymentMethod}}
  // Date: {{paymentDate}}

  // EVENT DETAILS:
  // Date: {{date}}
  // Time: {{startTime}} - {{endTime}}
  // Location: {{location}}
  // {{#if isVirtual}}Access Link: {{meetingLink}}{{/if}}`,
  //       body2: "",
  //       body3: `We've reserved your spot and look forward to your participation. Please save this information for your records.

  // If you have any questions or need special accommodations, please let us know.

  // Best regards,
  // The Team`,
  //     },

  //     Event_Booking_Cancellation: {
  //       subject: "Your Event Registration for {PRODUCT} has been Cancelled",
  //       body1: `Dear {{name}},

  // We're writing to confirm that your registration for the following event has been cancelled:

  // ORDER DETAILS:
  // Event: {{productTitle}}
  // Order ID: {{orderId}}

  // CANCELLED REGISTRATION:
  // Date: {{date}}
  // Time: {{startTime}} - {{endTime}}`,
  //       body2: "",
  //       body3: `If you'd like to register for any of our other events, please visit our events page.

  // Thank you for your understanding.

  // Best regards,
  // The Team`,
  //     },

  //     Calender_Booking_Confirmation: {
  //       subject: "Your {PRODUCT} Is Confirmed",
  //       body1: `Dear {{name}},

  // Your {{sessionType}} has been successfully scheduled!

  // APPOINTMENT DETAILS:
  // Date: {{date}}
  // Time: {{startTime}} - {{endTime}}
  // Location: {{location}}
  // {{#if isVirtual}}Meeting Link: {{meetingLink}}{{/if}}`,
  //       body2: "",
  //       body3: `Please make sure to be available at least 5 minutes before the scheduled time. If you need to reschedule or cancel, please do so at least 24 hours in advance.

  // We look forward to meeting with you!

  // Best regards,
  // The Team`,
  //     },

  //     Calender_Booking_Cancellation: {
  //       subject: "Your {PRODUCT} Has Been Cancelled",
  //       body1: `Dear {{name}},

  // We're writing to confirm that your {{sessionType}} has been cancelled as requested.

  // CANCELLED APPOINTMENT:
  // Date: {{date}}
  // Time: {{startTime}} - {{endTime}}`,
  //       body2: "",
  //       body3: `If you'd like to reschedule for another time, please visit our booking page or contact us directly.

  // Thank you for your understanding.

  // Best regards,
  // The Team`,
  //     },
  //   };

  Service: createTemplateObject('Service Confirmation', `Your Service Order for {{productTitle}}`, `Dear {{name}},

Thank you for your order! We're pleased to confirm that your service booking has been successfully processed.


Our team will contact you shortly to coordinate the details of your service.`, `If you have any questions in the meantime, please don't hesitate to reach out to our customer service team.

Thank you for choosing our services!

Best regards,
The Team`),

  Event_Booking_Confirmation: createTemplateObject('Event Registration Confirmation', `Your Event Registration for {{productTitle}} is Confirmed`, `Dear {{name}},

Thank you for registering for our upcoming event!

#ORDER SUMMARY:


#EVENT DETAILS:

If you have any questions or need special accommodations, please let us know.

Best regards,
The Team`),

  Event_Booking_Cancellation: createTemplateObject('Event Registration Cancellation', `Your Event Registration for {{productTitle}} has been Cancelled`, `Dear {{name}},

We're writing to confirm that your registration for the following event has been cancelled:

#ORDER DETAILS:


#CANCELLED REGISTRATION:


`, `If you'd like to register for any of our other events, please visit our events page.

Thank you for your understanding.

Best regards,
The Team`),

  Calender_Booking_Confirmation: createTemplateObject('Appointment Confirmation', `Your {{sessionType}} Is Confirmed`, `Dear {{name}},

Your {{sessionType}} has been successfully scheduled!

#APPOINTMENT DETAILS:


We look forward to meeting with you!

Best regards,
The Team`),


  // These are temporarily disabled but kept in the schema for future use
  Calender_Booking_Cancellation: createTemplateObject('Appointment Reminder', `Your {{sessionType}} Has Been Cancelled`, `Dear {{name}},

We're writing to confirm that your {{sessionType}} has been cancelled as requested.

#CANCELLED APPOINTMENT:

Thank you for your understanding.

Best regards,
The Team`),
})

const EmailTemplates = mongoose.model('EmailTemplates', emailTemplateSchema);
export default EmailTemplates;