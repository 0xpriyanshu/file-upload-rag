import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Agent from '../models/AgentModel.js';
import User from '../models/User.js';

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration
let transporter;
let googleAuth;

/**
 * Initialize the email transporter
 * You should call this when your app starts
 * @param {Object} config - Email configuration object
 */
export const initializeEmailService = (config) => {
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for 465, false for other ports
    auth: {
      user: config.auth.user,
      pass: config.auth.pass,
    },
  });
  
  // Initialize Google Calendar API client if credentials are provided
  if (config.googleCredentials) {
    const { clientId, clientSecret, redirectUri, refreshToken } = config.googleCredentials;
    
    if (clientId && clientSecret && refreshToken) {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      googleAuth = oauth2Client;
    }
  }
};

/**
 * Load an email template and compile with Handlebars
 * @param {string} templateName - Name of the template file (without extension)
 * @param {Object} data - Data to be injected into the template
 * @returns {string} Compiled HTML string
 */
const loadTemplate = (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
    const template = fs.readFileSync(templatePath, 'utf8');
    const compiledTemplate = Handlebars.compile(template);
    return compiledTemplate(data);
  } catch (error) {
    console.error(`Error loading email template ${templateName}:`, error);
    throw error;
  }
};

/**
 * Send an email using nodemailer
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template name
 * @param {Object} options.data - Data for template
 * @param {Array} [options.attachments] - Email attachments
 * @param {string} [options.cc] - Carbon copy recipients
 * @returns {Promise} - Nodemailer send result
 */
export const sendEmail = async ({ to, subject, template, data, attachments = [], cc }) => {
  if (!transporter) {
    throw new Error('Email service not initialized. Call initializeEmailService first.');
  }

  try {
    const html = loadTemplate(template, data);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Gobbl.ai" <no-reply@gobbl.ai>',
      to,
      subject,
      html,
      attachments
    };
    
    // Add CC if provided
    if (cc) {
      mailOptions.cc = cc;
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Create a Google Calendar event with Meet link
 * @param {Object} eventDetails - Event details
 * @returns {Promise<string>} - Meeting link
 */
 export const createGoogleMeetEvent = async (eventDetails) => {
    if (!googleAuth) {
      throw new Error('Google Calendar API is not initialized.');
    }
  
    try {
      const calendar = google.calendar({ version: 'v3', auth: googleAuth });
  
      const startDateTime = new Date(eventDetails.date);
      const [startHours, startMinutes] = eventDetails.startTime.split(':').map(Number);
      startDateTime.setHours(startHours, startMinutes, 0, 0);
  
      const endDateTime = new Date(eventDetails.date);
      const [endHours, endMinutes] = eventDetails.endTime.split(':').map(Number);
      endDateTime.setHours(endHours, endMinutes, 0, 0);
  
      const attendees = [];
      if (eventDetails.userEmail) attendees.push({ email: eventDetails.userEmail });
      if (eventDetails.adminEmail) attendees.push({ email: eventDetails.adminEmail });
  
      const event = {
        summary: eventDetails.summary || 'Appointment',
        description: eventDetails.notes || 'Meeting details',
        start: { dateTime: startDateTime.toISOString(), timeZone: eventDetails.userTimezone },
        end: { dateTime: endDateTime.toISOString(), timeZone: eventDetails.userTimezone },
        conferenceData: {
          createRequest: {
            requestId: uuidv4(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        },
        attendees
      };
  
      const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1
      });
  
      const meetLink = response.data.conferenceData?.entryPoints?.find(
        ep => ep.entryPointType === 'video'
      )?.uri;
  
      if (!meetLink) {
        throw new Error('Failed to get Google Meet link from response.');
      }
  
      return meetLink;
    } catch (error) {
      console.error('Error creating Google Meet event:', error);
      throw error;
    }
  };

  
/**
 * Get admin email by agent ID
 * @param {string} agentId - The agent ID
 * @returns {Promise<string|null>} - Admin email or null
 */
 export const getAdminEmailByAgentId = async (agentId) => {
    try {
      const agent = await Agent.findOne({ agentId }).lean();
      
      if (!agent || !agent.clientId) {
        return null;
      }
      
      const clientId = agent.clientId;
      const clientCollection = mongoose.connection.collection('Client');
      
      let client = await clientCollection.findOne({ _id: clientId });
      
      if (!client) {
        client = await clientCollection.findOne({ _id: String(clientId) });
      }
      
      if (!client && mongoose.Types.ObjectId.isValid(clientId)) {
        client = await clientCollection.findOne({ 
          _id: new mongoose.Types.ObjectId(clientId) 
        });
      }
      
      if (client && client.signUpVia && client.signUpVia.handle) {
        return client.signUpVia.handle;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting admin email:', error);
      return null;
    }
  };

/**
 * Send a booking confirmation email to both user and admin
 * @param {Object} bookingDetails - Booking information
 * @returns {Promise} - Email send result
 */
 export const sendBookingConfirmationEmail = async (bookingDetails) => {
    const { 
      email, 
      adminEmail, 
      name, 
      date, 
      startTime, 
      endTime, 
      location, 
      meetingLink,
      userTimezone,
      notes
    } = bookingDetails;
    
    console.log('Sending confirmation emails to:', { userEmail: email, adminEmail });
    
    // Format date for display
    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: userTimezone
    });
  
    // Get location display text
    const locationDisplay = {
      'google_meet': 'Google Meet',
      'zoom': 'Zoom',
      'teams': 'Microsoft Teams',
      'in_person': 'In Person'
    }[location] || location;
  
    // Common data for both emails
    const commonData = {
      date: formattedDate,
      startTime,
      endTime,
      location: locationDisplay,
      meetingLink,
      userTimezone,
      isVirtual: ['google_meet', 'zoom', 'teams'].includes(location),
      notes
    };
  
    // Send email to the user
    try {
      await sendEmail({
        to: email,
        subject: 'Your Appointment Confirmation',
        template: 'booking-confirmation',
        data: {
          ...commonData,
          name,
          isClient: true
        }
      });
      console.log('User confirmation email sent successfully');
    } catch (error) {
      console.error('Error sending user confirmation email:', error);
    }
  
    // If we have admin email, send them a notification too
    if (adminEmail) {
      try {
        await sendEmail({
          to: adminEmail,
          subject: 'New Appointment Booking',
          template: 'admin-booking-notification',
          data: {
            ...commonData,
            clientName: name,
            clientEmail: email,
            isAdmin: true
          }
        });
        console.log('Admin notification email sent successfully');
      } catch (error) {
        console.error('Error sending admin notification email:', error);
      }
    } else {
      console.log('No admin email available, skipping admin notification');
    }
    
    return true;
  };

/**
 * Send a booking cancellation email to both user and admin
 * @param {Object} bookingDetails - Booking information
 * @returns {Promise} - Email send result 
 */
export const sendBookingCancellationEmail = async (bookingDetails) => {
  const { email, adminEmail, name, date, startTime, endTime, userTimezone } = bookingDetails;
  
  // Format date for display
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  // Common data
  const commonData = {
    date: formattedDate,
    startTime,
    endTime,
    userTimezone
  };

  // Send to user
  await sendEmail({
    to: email,
    subject: 'Your Appointment Has Been Cancelled',
    template: 'booking-cancellation',
    data: {
      ...commonData,
      name,
      isClient: true
    }
  });
  
  // Send to admin if available
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: 'Appointment Cancellation',
      template: 'admin-booking-cancellation',
      data: {
        ...commonData,
        clientName: name,
        clientEmail: email,
        isAdmin: true
      }
    });
  }
  
  return true;
};