import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Agent from '../models/AgentModel.js';
import Client from '../models/ClientModel.js';
import EmailTemplates from '../models/EmailTemplates.js';
import AppointmentSettings from "../models/AppointmentSettingsModel.js";
import User from '../models/User.js';
import AWS from 'aws-sdk'; // Added AWS SDK

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Email configuration
let transporter;
let googleAuth;
let sesConfig;

/**
 * Initialize the email transporter
 * You should call this when your app starts
 * @param {Object} config - Email configuration object
 */
export const initializeEmailService = (config) => {
  // Configure AWS SDK
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  
  // Store SES config for direct API access if needed
  sesConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  };

  // Create SES transporter
  if (process.env.USE_SES_API === 'true') {
    // Option 1: Use AWS SES SDK directly (more features)
    const ses = new AWS.SES({ apiVersion: '2010-12-01' });
    transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS }
    });
  } else {
    // Option 2: Use SES SMTP interface (more compatible with existing code)
    transporter = nodemailer.createTransport({
      host: process.env.SES_SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
      port: parseInt(process.env.SES_SMTP_PORT || '587'),
      secure: process.env.SES_SMTP_SECURE === 'true',
      auth: {
        user: process.env.SES_SMTP_USERNAME,
        pass: process.env.SES_SMTP_PASSWORD
      }
    });
  }
  
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
 * Send an email using nodemailer with Amazon SES
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

    // Optional: SES-specific configurations
    if (process.env.USE_SES_API === 'true') {
      // Add SES-specific configurations here if needed
      mailOptions.ses = {
        // Optional SES-specific message tags
        Tags: [
          {
            Name: 'email_type',
            Value: template
          }
        ]
      };
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
 * Direct method to send email using AWS SES API (for advanced use cases)
 * @param {Object} options - Email options 
 */
export const sendEmailWithSesAPI = async ({ to, subject, template, data, attachments = [], cc }) => {
  if (!sesConfig) {
    throw new Error('SES not initialized. Call initializeEmailService first.');
  }

  const ses = new AWS.SES({
    apiVersion: '2010-12-01',
    region: sesConfig.region,
    accessKeyId: sesConfig.accessKeyId,
    secretAccessKey: sesConfig.secretAccessKey
  });

  try {
    const html = loadTemplate(template, data);
    
    const recipients = Array.isArray(to) ? to : [to];
    const ccRecipients = cc ? (Array.isArray(cc) ? cc : [cc]) : [];
    
    const params = {
      Source: process.env.EMAIL_FROM || '"Gobbl.ai" <no-reply@gobbl.ai>',
      Destination: {
        ToAddresses: recipients,
        CcAddresses: ccRecipients
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8'
          }
        }
      },
      Tags: [
        {
          Name: 'email_type',
          Value: template
        }
      ]
    };

    // Attachments need to be handled differently with SES API
    // For simplicity, this implementation doesn't include attachments
    // If needed, you would need to use MIME or raw message format
    
    const result = await ses.sendEmail(params).promise();
    console.log(`Email sent with SES API: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error('Error sending email with SES API:', error);
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
    
    console.log('Creating Google Calendar event with details:', {
      date: eventDetails.date,
      startTime: eventDetails.startTime,
      endTime: eventDetails.endTime,
      userTimezone: eventDetails.userTimezone
    });

    const dateObj = new Date(eventDetails.date);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const [startHour, startMinute] = eventDetails.startTime.split(':');
    const [endHour, endMinute] = eventDetails.endTime.split(':');
    
    const userTimezone = eventDetails.userTimezone || 'UTC';
    
    const startDateTimeStr = `${year}-${month}-${day}T${startHour}:${startMinute}:00`;
    const endDateTimeStr = `${year}-${month}-${day}T${endHour}:${endMinute}:00`;
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    });
    
    const userStartDate = new Date(`${startDateTimeStr}`);
    const userEndDate = new Date(`${endDateTimeStr}`);
    
    const startParts = formatter.formatToParts(userStartDate);
    const timezonePart = startParts.find(part => part.type === 'timeZoneName');
    const timezoneShort = timezonePart ? timezonePart.value : '';
    
    console.log(`Using timezone: ${userTimezone} (${timezoneShort})`);
    console.log(`Start time in local format: ${formatter.format(userStartDate)}`);
    console.log(`End time in local format: ${formatter.format(userEndDate)}`);
    
    const event = {
      summary: eventDetails.summary || 'Appointment',
      description: `${eventDetails.notes || 'Meeting details'}\n\nNote: Admin should join first to become the meeting host.`,
      start: {
        dateTime: `${startDateTimeStr}`,
        timeZone: userTimezone
      },
      end: {
        dateTime: `${endDateTimeStr}`,
        timeZone: userTimezone
      },
      conferenceData: {
        createRequest: {
          requestId: uuidv4(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      attendees: [],
      guestsCanModify: false,
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: true
    };
    
    if (eventDetails.adminEmail) {
      event.attendees.push({ 
        email: eventDetails.adminEmail,
        organizer: true,
        responseStatus: 'accepted'
      });
    }
    
    if (eventDetails.userEmail) {
      event.attendees.push({ 
        email: eventDetails.userEmail,
        responseStatus: 'accepted'
      });
    }

    console.log('Google Calendar event object:', {
      summary: event.summary,
      start: event.start,
      end: event.end
    });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'none'
    });

    const meetLink = response.data.conferenceData?.entryPoints?.find(
      ep => ep.entryPointType === 'video'
    )?.uri;

    if (!meetLink) {
      throw new Error('Failed to get Google Meet link from response.');
    }

    console.log('Successfully created Google Meet with link:', meetLink);
    return meetLink;
  } catch (error) {
    console.error('Error creating Google Meet event:', error);
    throw error;
  }
};

/**
 * Get OAuth access token for Zoom API
 * @returns {Promise<string>} - Access token
 */
 const getZoomAccessToken = async () => {
    try {
      // Get Zoom API credentials from environment variables
      const CLIENT_ID = process.env.ZOOM_CLIENT_ID;
      const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
      const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
      
      if (!CLIENT_ID || !CLIENT_SECRET || !ACCOUNT_ID) {
        throw new Error('Zoom OAuth credentials not configured');
      }
      
      // Encode credentials for Basic Auth
      const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      
      // Request access token
      const tokenResponse = await axios.post(
        'https://zoom.us/oauth/token',
        new URLSearchParams({
          grant_type: 'account_credentials',
          account_id: ACCOUNT_ID
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return tokenResponse.data.access_token;
    } catch (error) {
      console.error('Error getting Zoom access token:', error.message);
      if (error.response) {
        console.error('Zoom OAuth response:', error.response.data);
      }
      throw new Error('Failed to obtain Zoom access token');
    }
  };
  
  /**
   * Create a Zoom meeting and get the join URL
   * @param {Object} meetingDetails - Meeting information
   * @returns {Promise<string>} - Zoom meeting link
   */
  export const createZoomMeeting = async (meetingDetails) => {
    try {
      // Get access token
      const accessToken = await getZoomAccessToken();
      
      // Use the me endpoint to get the current user's info (requires less permission)
      const meResponse = await axios.get(
        'https://api.zoom.us/v2/users/me',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Use the current user's ID
      const userId = meResponse.data.id;
      console.log(`Using Zoom user ID: ${userId}`);
      
      // Format date and time for Zoom API
      const date = new Date(meetingDetails.date);
      const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
      date.setHours(startHours, startMinutes, 0, 0);
      
      // Calculate duration in minutes
      const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
      const endDate = new Date(meetingDetails.date);
      endDate.setHours(endHours, endMinutes, 0, 0);
      
      const durationInMinutes = Math.ceil((endDate - date) / (1000 * 60));
      
      // Create meeting in Zoom
      const response = await axios.post(
        `https://api.zoom.us/v2/users/${userId}/meetings`,
        {
          topic: meetingDetails.summary || 'Appointment Meeting',
          type: 2, // Scheduled meeting
          start_time: date.toISOString(),
          duration: durationInMinutes,
          timezone: meetingDetails.userTimezone,
          agenda: meetingDetails.notes || 'Meeting details',
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: true,
            mute_upon_entry: false,
            auto_recording: 'none',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      // Return the join URL from the response
      return response.data.join_url;
    } catch (error) {
      console.error('Error creating Zoom meeting:', error.message);
      if (error.response) {
        console.error('Zoom API response:', error.response.data);
      }
      
      // If we're getting a permission error, try with a static "me" value
      if (error.response && error.response.data && 
          (error.response.data.code === 4711 || error.response.data.code === 1001)) {
        try {
          console.log('Attempting to create meeting with static "me" value');
          
          const accessToken = await getZoomAccessToken();
          
          // Format date and time for Zoom API
          const date = new Date(meetingDetails.date);
          const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
          date.setHours(startHours, startMinutes, 0, 0);
          
          // Calculate duration in minutes
          const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
          const endDate = new Date(meetingDetails.date);
          endDate.setHours(endHours, endMinutes, 0, 0);
          
          const durationInMinutes = Math.ceil((endDate - date) / (1000 * 60));
          
          // Create meeting using "me" which should work with minimal permissions
          const response = await axios.post(
            'https://api.zoom.us/v2/users/me/meetings',
            {
              topic: meetingDetails.summary || 'Appointment Meeting',
              type: 2, // Scheduled meeting
              start_time: date.toISOString(),
              duration: durationInMinutes,
              timezone: meetingDetails.userTimezone,
              agenda: meetingDetails.notes || 'Meeting details',
              settings: {
                host_video: true,
                participant_video: true,
                join_before_host: true,
                mute_upon_entry: false,
                auto_recording: 'none',
              },
            },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          return response.data.join_url;
        } catch (retryError) {
          console.error('Error in fallback Zoom meeting creation:', retryError.message);
          if (retryError.response) {
            console.error('Zoom API fallback response:', retryError.response.data);
          }
          throw new Error('Failed to create Zoom meeting after multiple attempts');
        }
      }
      
      throw new Error('Failed to create Zoom meeting');
    }
  };
  
/**
 * Create a Microsoft Teams meeting using alternative API approach
 * @param {Object} meetingDetails - Meeting information
 * @returns {Promise<string>} - Teams meeting link
 */
 export const createTeamsMeeting = async (meetingDetails) => {
    try {
      // Get Microsoft Graph API credentials from environment variables
      const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
      const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
      const TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
      const USER_EMAIL = process.env.MS_GRAPH_USER_EMAIL;
      
      if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID || !USER_EMAIL) {
        throw new Error('Microsoft Graph API credentials not configured');
      }
      
      console.log(`Attempting Teams meeting creation for: ${USER_EMAIL}`);
      
      // Get access token
      const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: CLIENT_ID,
          scope: 'https://graph.microsoft.com/.default',
          client_secret: CLIENT_SECRET,
          grant_type: 'client_credentials',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      const accessToken = tokenResponse.data.access_token;
      
      // Format date and time
      const startDate = new Date(meetingDetails.date);
      const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
      startDate.setHours(startHours, startMinutes, 0, 0);
      
      const endDate = new Date(meetingDetails.date);
      const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
      endDate.setHours(endHours, endMinutes, 0, 0);
      
      // Try different approaches sequentially, starting with the most direct one
      
      // Approach 1: Try direct user endpoint
      try {
        console.log('Attempting approach 1: Direct user endpoint');
        const response = await axios.post(
          `https://graph.microsoft.com/v1.0/users/${USER_EMAIL}/onlineMeetings`,
          {
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString(),
            subject: meetingDetails.summary || 'Appointment Meeting',
            lobbyBypassSettings: {
              scope: 'everyone',
              isDialInBypassEnabled: true,
            },
          },
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        console.log('Approach 1 succeeded');
        return response.data.joinWebUrl;
      } catch (error1) {
        console.log('Approach 1 failed:', error1.message);
        
        // Approach 2: Try the application-level meeting creation endpoint
        try {
          console.log('Attempting approach 2: Application-level meeting creation');
          const response = await axios.post(
            'https://graph.microsoft.com/v1.0/me/onlineMeetings',
            {
              startDateTime: startDate.toISOString(),
              endDateTime: endDate.toISOString(),
              subject: meetingDetails.summary || 'Appointment Meeting',
              lobbyBypassSettings: {
                scope: 'everyone',
                isDialInBypassEnabled: true,
              },
            },
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          console.log('Approach 2 succeeded');
          return response.data.joinWebUrl;
        } catch (error2) {
          console.log('Approach 2 failed:', error2.message);
          
          // Approach 3: Try user lookup by email then use ID
          try {
            console.log('Attempting approach 3: User lookup by email then use ID');
            // Get user details first
            const userResponse = await axios.get(
              `https://graph.microsoft.com/v1.0/users?$filter=mail eq '${USER_EMAIL}'`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            
            if (userResponse.data.value && userResponse.data.value.length > 0) {
              const userId = userResponse.data.value[0].id;
              console.log(`Found user ID: ${userId}`);
              
              const response = await axios.post(
                `https://graph.microsoft.com/v1.0/users/${userId}/onlineMeetings`,
                {
                  startDateTime: startDate.toISOString(),
                  endDateTime: endDate.toISOString(),
                  subject: meetingDetails.summary || 'Appointment Meeting',
                  lobbyBypassSettings: {
                    scope: 'everyone',
                    isDialInBypassEnabled: true,
                  },
                },
                {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
              
              console.log('Approach 3 succeeded');
              return response.data.joinWebUrl;
            } else {
              throw new Error('User not found with the provided email');
            }
          } catch (error3) {
            console.log('Approach 3 failed:', error3.message);
            throw new Error('All approaches to create Teams meeting failed');
          }
        }
      }
    } catch (error) {
      console.error('Error creating Teams meeting:', error.message);
      if (error.response) {
        console.error('Microsoft Graph API response:', error.response.data);
      }
      
      throw new Error('Failed to create Teams meeting after trying multiple approaches');
    }
  };

/**
 * Get admin email by agent ID
 * @param {string} agentId - The agent ID
 * @returns {Promise<string|null>} - Admin email or null
 */
 export const getAdminEmailByAgentId = async (agentId) => {
    try {
      const agent = await Agent.findOne({ agentId })
      let clientEmail = null;
      
      const client = await Client.findOne({ _id: agent.clientId })
      
      if (client && client.signUpVia && client.signUpVia.handle) {
        clientEmail = client.signUpVia.handle;
      }
      
      return clientEmail;
    } catch (error) {
      console.error('Error getting admin email:', error);
      return null;
    }
  };


/**
 * Send a booking cancellation email to both user and admin
 * @param {Object} bookingDetails - Booking information
 * @returns {Promise} - Email send result 
 */
 export const sendBookingCancellationEmail = async (bookingDetails) => {
  const { email, adminEmail, name, date, startTime, endTime, userTimezone, sessionType = 'Consultation', agentId } = bookingDetails;
  
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  const templateData = {
    name,
    email,
    date: formattedDate,
    startTime,
    endTime,
    userTimezone,
    sessionType,
    currentYear: new Date().getFullYear().toString()
  };

  console.log('Attempting to fetch custom template for Calender_Booking_Cancellation');
  
  const customTemplate = await getCustomEmailTemplate(agentId, 'Calender_Booking_Cancellation');
  
  console.log('Custom template fetch result:', customTemplate ? 'Template found' : 'No template found');

  try {
    if (customTemplate) {
      console.log('Using custom template for booking cancellation');
      
      const subject = renderTemplate(customTemplate.subject, templateData);
      templateData.body1 = renderTemplate(customTemplate.body1, templateData);
      templateData.body2 = renderTemplate(customTemplate.body2, templateData);
      templateData.body3 = renderTemplate(customTemplate.body3, templateData);
      
      await sendEmail({
        to: email,
        subject: subject,
        template: 'booking-cancellation',
        data: {
          ...templateData,
          isClient: true
        }
      });
    } else {
      
      await sendEmail({
        to: email,
        subject: 'Your Appointment Has Been Cancelled',
        template: 'booking-cancellation',
        data: {
          ...templateData,
          isClient: true
        }
      });
    }
    console.log('User cancellation email sent successfully');
  } catch (error) {
    console.error('Error sending user cancellation email:', error);
  }
  
  if (adminEmail) {
    try {
      const adminTimezone = await getAdminTimezone(agentId);
      
      const adminTimeData = convertTimeToTimezone(date, startTime, userTimezone, adminTimezone);
      const adminEndTimeData = convertTimeToTimezone(date, endTime, userTimezone, adminTimezone);
      
      const adminFormattedDate = adminTimeData ? 
        new Date(adminTimeData.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: adminTimezone
        }) : formattedDate;
      
      const adminTemplateData = {
        ...templateData,
        clientName: name,
        clientEmail: email,
        isAdmin: true,
        adminDate: adminFormattedDate,
        adminStartTime: adminTimeData?.time || startTime,
        adminEndTime: adminEndTimeData?.time || endTime,
        adminTimezone,
        clientDate: formattedDate,
        clientStartTime: startTime,
        clientEndTime: endTime,
        clientTimezone: userTimezone,
        showBothTimezones: adminTimezone !== userTimezone
      };
      
      await sendEmail({
        to: adminEmail,
        subject: `${sessionType} Cancellation`,  
        template: 'admin-booking-cancellation',
        data: adminTemplateData
      });
      console.log('Admin notification email sent successfully');
    } catch (error) {
      console.error('Error sending admin notification email:', error);
    }
  }
  
  return true;
};

/**
 * Send reschedule confirmation emails to both user and admin
 * @param {Object} details - Reschedule details
 * @returns {Promise} - Email send result
 */
 export const sendRescheduleConfirmationEmail = async (details) => {
  const {
    email,
    adminEmail,
    name,
    originalDate,
    originalStartTime,
    originalEndTime,
    newDate,
    newStartTime,
    newEndTime,
    location,
    meetingLink,
    userTimezone,
    sessionType = 'Consultation',
    agentId
  } = details;

  const formattedOriginalDate = new Date(originalDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  const formattedNewDate = new Date(newDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  const locationDisplay = {
    'google_meet': 'Google Meet',
    'zoom': 'Zoom',
    'teams': 'Microsoft Teams',
    'in_person': 'In Person'
  }[location] || location;

  const commonData = {
    originalDate: formattedOriginalDate,
    originalStartTime,
    originalEndTime,
    newDate: formattedNewDate,
    newStartTime,
    newEndTime,
    location: locationDisplay,
    meetingLink,
    userTimezone,
    isVirtual: ['google_meet', 'zoom', 'teams'].includes(location),
    sessionType
  };

  try {
    await sendEmail({
      to: email,
      subject: `Your ${sessionType} Has Been Rescheduled`,
      template: 'booking-reschedule',
      data: {
        ...commonData,
        name,
        isClient: true
      }
    });
    console.log('User reschedule confirmation email sent successfully');
  } catch (error) {
    console.error('Error sending user reschedule confirmation email:', error);
  }

  if (adminEmail) {
    try {
      const adminTimezone = await getAdminTimezone(agentId);
      
      const adminOriginalStartData = convertTimeToTimezone(originalDate, originalStartTime, userTimezone, adminTimezone);
      const adminOriginalEndData = convertTimeToTimezone(originalDate, originalEndTime, userTimezone, adminTimezone);
      const adminOriginalFormattedDate = adminOriginalStartData ? 
        new Date(adminOriginalStartData.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: adminTimezone
        }) : formattedOriginalDate;
      
      const adminNewStartData = convertTimeToTimezone(newDate, newStartTime, userTimezone, adminTimezone);
      const adminNewEndData = convertTimeToTimezone(newDate, newEndTime, userTimezone, adminTimezone);
      const adminNewFormattedDate = adminNewStartData ? 
        new Date(adminNewStartData.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: adminTimezone
        }) : formattedNewDate;
      
      const adminTemplateData = {
        ...commonData,
        clientName: name,
        clientEmail: email,
        isAdmin: true,
        adminOriginalDate: adminOriginalFormattedDate,
        adminOriginalStartTime: adminOriginalStartData?.time || originalStartTime,
        adminOriginalEndTime: adminOriginalEndData?.time || originalEndTime,
        adminNewDate: adminNewFormattedDate,
        adminNewStartTime: adminNewStartData?.time || newStartTime,
        adminNewEndTime: adminNewEndData?.time || newEndTime,
        adminTimezone,
        clientOriginalDate: formattedOriginalDate,
        clientOriginalStartTime: originalStartTime,
        clientOriginalEndTime: originalEndTime,
        clientNewDate: formattedNewDate,
        clientNewStartTime: newStartTime,
        clientNewEndTime: newEndTime,
        clientTimezone: userTimezone,
        showBothTimezones: adminTimezone !== userTimezone
      };
      
      await sendEmail({
        to: adminEmail,
        subject: `${sessionType} Rescheduled`,
        template: 'admin-booking-reschedule',
        data: adminTemplateData
      });
      console.log('Admin reschedule notification email sent successfully');
    } catch (error) {
      console.error('Error sending admin reschedule notification email:', error);
    }
  }

  return true;
};

/**
 * Send reschedule request email from admin to user
 * @param {Object} details - Request details
 * @returns {Promise} - Email send result
 */
export const sendRescheduleRequestEmail = async (details) => {
  const {
    email,
    adminEmail,
    name,
    date,
    startTime,
    endTime,
    userTimezone,
    rescheduleLink,
    agentName,
    sessionType = 'appointment'
  } = details;

  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  try {
    await sendEmail({
      to: email,
      subject: `Request to Reschedule Your ${sessionType}`,
      template: 'reschedule-request',
      data: {
        name,
        date: formattedDate,
        startTime,
        endTime,
        userTimezone,
        rescheduleLink,
        agentName,
        sessionType
      }
    });
    console.log('Reschedule request email sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending reschedule request email:', error);
    throw error;
  }
};

/**
 * Renders a template with provided data
 * @param {string} template - Template string with placeholders
 * @param {Object} data - Data for replacement
 * @returns {string} - Rendered string
 */
 const renderTemplate = (template, data) => {
  if (!template) return '';
  
  // First, handle {{#if condition}}...{{/if}} blocks
  let processedTemplate = template.replace(/\{\{#if\s+([^}]+)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, content) => {
    const conditionValue = data[condition];
    return conditionValue && conditionValue !== "false" ? content : '';
  });
  
  // Then replace all regular placeholders
  return processedTemplate.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

/**
 * Get a custom email template from the database
 * @param {string} agentId - The agent ID
 * @param {string} templateKey - Template key
 * @returns {Promise<Object|null>} - Template object or null
 */
 const getCustomEmailTemplate = async (agentId, templateKey) => {
  try {
    if (!agentId) return null;
    
    const emailTemplatesData = await EmailTemplates.findOne({ agentId });
    
    if (emailTemplatesData && emailTemplatesData[templateKey]) {
      const template = emailTemplatesData[templateKey];
      
      if (template && template.isActive) {
        return {
          subject: template.subject,
          body1: template.body1,
          body2: template.body2,
          body3: template.body3
        };
      }
    }
    
    return null;
  } catch (err) {
    console.error(`Error fetching custom template for ${templateKey}:`, err);
    return null;
  }
};

/**
 * Send an order confirmation email to both user and admin
 * @param {Object} orderDetails - Order information
 * @returns {Promise} - Email send result
 */
 export const sendOrderConfirmationEmail = async (orderDetails) => {
  const { 
    items,
    email,
    adminEmail,
    name,
    totalAmount,
    orderId,
    paymentMethod,
    paymentDate,
    currency,
    agentId
  } = orderDetails;
  
  console.log('Sending order confirmation emails for order:', orderId);
  
  try {
    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(totalAmount/100); 

    const currentYear = new Date().getFullYear();

    const validItems = Array.isArray(items) ? items : [];
    const primaryProduct = validItems.length > 0 ? validItems[0] : null;
    
    let templateKey, templateName;
    
    if (primaryProduct?.type === 'digitalProduct') {
      templateKey = 'digitalProduct';
      templateName = 'digital-product-confirmation';
    } else if (primaryProduct?.type === 'physicalProduct') {
      templateKey = 'physicalProduct';
      templateName = 'physical-product-confirmation';
    } else if (primaryProduct?.type === 'event') {
      templateKey = 'Event_Booking_Confirmation';
      templateName = 'event-booking-confirmation';
    } else {
      templateKey = 'Service';
      templateName = 'service-confirmation';
    }
    
    const templateData = {
      name,
      email,
      orderId: orderId || 'N/A',
      totalAmount: formattedTotal,
      paymentMethod: paymentMethod || 'Credit Card',
      paymentDate: paymentDate || new Date().toLocaleDateString(),
      productTitle: primaryProduct?.title || 'Your order',
      productDescription: primaryProduct?.description || '',
      fileUrl: primaryProduct?.fileUrl || '',
      primaryProductImage: primaryProduct?.image?.[0] || primaryProduct?.images?.[0] || null,
      currentYear: currentYear.toString()
    };
    
    // For event type, add event-specific data
    if (primaryProduct?.type === 'event' && primaryProduct.slots && primaryProduct.slots.length > 0) {
      const slot = primaryProduct.slots[0];
      const eventDate = new Date(slot.date);
      
      templateData.date = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      templateData.startTime = slot.start;
      templateData.endTime = slot.end;
      
      // Set location and isVirtual
      if (primaryProduct.locationType === 'online') {
        templateData.location = 'Virtual Event';
        templateData.isVirtual = true;
        templateData.meetingLink = primaryProduct.fileUrl || 'Your access link will be provided closer to the event date';
      } else {
        templateData.location = primaryProduct.address || 'In-Person Event';
        templateData.isVirtual = false;
      }
    }
    
    // For digital products, ensure file URL is available
    if (primaryProduct?.type === 'digitalProduct') {
      templateData.fileUrl = primaryProduct.fileUrl || primaryProduct.downloadUrl || '';
      templateData['hasFileUrl'] = !!templateData.fileUrl;
    }
    
    let customTemplate = null;
    
    if (agentId) {
      try {
        customTemplate = await getCustomEmailTemplate(agentId, templateKey);
      } catch (err) {
        console.error('Error fetching custom template:', err);
      }
    }
    
    try {
      if (customTemplate) {
        const subject = renderTemplate(customTemplate.subject, templateData);
        templateData.body1 = renderTemplate(customTemplate.body1, templateData);
        templateData.body2 = renderTemplate(customTemplate.body2, templateData);
        templateData.body3 = renderTemplate(customTemplate.body3, templateData);
        
        console.log('Using custom template for order confirmation');
        
        await sendEmail({
          to: email,
          subject: subject,
          template: templateName,
          data: templateData
        });
      } else {
        console.log('Using default template for order confirmation');
        
        // Use default templates without body1, body2, body3
        await sendEmail({
          to: email,
          subject: primaryProduct?.type === 'digitalProduct' ? 
                    'Your Digital Product Order' : 
                    primaryProduct?.type === 'event' ?
                    'Your Event Registration is Confirmed' :
                    primaryProduct?.type === 'physicalProduct' ?
                    'Your Order Confirmation' :
                    'Your Service Booking Confirmation',
          template: templateName,
          data: templateData
        });
      }
      
      console.log('User order confirmation email sent successfully');
    } catch (error) {
      console.error('Error sending user order confirmation email:', error);
    }

    // Admin notification
    if (adminEmail) {
      try {
        const adminTemplateData = {
          ...templateData,
          customerName: name,
          customerEmail: email
        };
        
        if (customTemplate) {
          const subject = `New Order: ${renderTemplate(customTemplate.subject, templateData)}`;
          
          await sendEmail({
            to: adminEmail,
            subject: subject,
            template: 'admin-order-notification',
            data: adminTemplateData
          });
        } else {
          await sendEmail({
            to: adminEmail,
            subject: `New Order Received: ${orderId}`,
            template: 'admin-order-notification',
            data: adminTemplateData
          });
        }
        
        console.log('Admin order notification email sent successfully');
      } catch (error) {
        console.error('Error sending admin order notification email:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in sendOrderConfirmationEmail:', error);
    return false;
  }
};

async function sendPhysicalProductOrderConfirmationEmail(orderDetails){
  try{
    const {
      email,
      adminEmail,
      name,
      totalAmount,
      orderId,
      paymentMethod,
      paymentDate,
      currency,
      agentId,
      emailTemplate
    } = orderDetails;

    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(totalAmount/100);  

    const currentYear = new Date().getFullYear();

    const templateData = {
      name,
      email,
      orderId,
      totalAmount: formattedTotal,
    }
    
  } 
  catch(error){
    console.error('Error sending physical product order confirmation email:', error);
  }
}


/**
 * Send an event cancellation email 
 * @param {Object} cancellationDetails - Cancellation details
 * @returns {Promise} - Email send result
 */
 export const sendEventCancellationEmail = async (cancellationDetails) => {
  const {
    email,
    adminEmail,
    name,
    orderId,
    productTitle,
    date,
    startTime,
    endTime,
    agentId
  } = cancellationDetails;
  
  // Template data
  const templateData = {
    name,
    email,
    orderId,
    productTitle,
    date,
    startTime,
    endTime,
    currentYear: new Date().getFullYear().toString()
  };
  
  console.log('Attempting to fetch custom template for Event_Booking_Cancellation');
  
  const customTemplate = await getCustomEmailTemplate(agentId, 'Event_Booking_Cancellation');
  
  console.log('Custom template fetch result:', customTemplate ? 'Template found' : 'No template found');

  try {
    if (customTemplate) {
      console.log('Using custom template for event cancellation');
      
      // Use custom template
      const subject = renderTemplate(customTemplate.subject, templateData);
      templateData.body1 = renderTemplate(customTemplate.body1, templateData);
      templateData.body2 = renderTemplate(customTemplate.body2, templateData);
      templateData.body3 = renderTemplate(customTemplate.body3, templateData);
      
      await sendEmail({
        to: email,
        subject: subject,
        template: 'event-booking-cancellation',
        data: templateData
      });
    } else {
      console.log('Using default template for event cancellation');
      await sendEmail({
        to: email,
        subject: 'Your Event Registration has been Cancelled',
        template: 'event-booking-cancellation',
        data: templateData
      });
    }
    console.log('User event cancellation email sent successfully');
  } catch (error) {
    console.error('Error sending user event cancellation email:', error);
  }
  
  if (adminEmail) {
    try {
      await sendEmail({
        to: adminEmail,
        subject: 'Event Registration Cancellation',  
        template: 'admin-event-cancellation',
        data: {
          ...templateData,
          customerName: name,
          customerEmail: email
        }
      });
      console.log('Admin event cancellation email sent successfully');
    } catch (error) {
      console.error('Error sending admin event cancellation email:', error);
    }
  }
  
  return true;
};

/**
 * Sends a booking confirmation email (for calendar bookings)
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
    notes,
    sessionType = 'Consultation',
    agentId
  } = bookingDetails;
  
  console.log('Sending confirmation emails to:', { userEmail: email, adminEmail, sessionType, agentId });
  
  // Format date for display
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });
  
  const locationDisplay = {
    'google_meet': 'Google Meet',
    'zoom': 'Zoom',
    'teams': 'Microsoft Teams',
    'in_person': 'In Person'
  }[location] || location;
  
  const templateData = {
    name,
    email,
    date: formattedDate,
    startTime,
    endTime,
    location: locationDisplay,
    meetingLink,
    userTimezone,
    isVirtual: ['google_meet', 'zoom', 'teams'].includes(location) ? true : false,
    notes,
    sessionType,
    currentYear: new Date().getFullYear().toString()
  };
  
  console.log('Attempting to fetch custom template for Calender_Booking_Confirmation');
  
  const customTemplate = await getCustomEmailTemplate(agentId, 'Calender_Booking_Confirmation');
  
  console.log('Custom template fetch result:', customTemplate ? 'Template found' : 'No template found');

  try {
    let emailSubject = `Your ${sessionType} is Confirmed`;
    
    if (customTemplate) {
      console.log('Using custom template for booking confirmation');
      
      emailSubject = renderTemplate(customTemplate.subject, templateData);
      templateData.body1 = renderTemplate(customTemplate.body1, templateData);
      templateData.body2 = renderTemplate(customTemplate.body2, templateData);
      templateData.body3 = renderTemplate(customTemplate.body3, templateData);
      
      await sendEmail({
        to: email,
        subject: emailSubject,
        template: 'booking-confirmation',
        data: {
          ...templateData,
          isClient: true
        }
      });
    } else {     
      await sendEmail({
        to: email,
        subject: emailSubject,
        template: 'booking-confirmation',
        data: {
          ...templateData,
          isClient: true
        }
      });
    }
    console.log('User confirmation email sent successfully');
  } catch (error) {
    console.error('Error sending user confirmation email:', error);
  }
  
  if (adminEmail) {
    try {
      const adminTimezone = await getAdminTimezone(agentId);
      
      const adminTimeData = convertTimeToTimezone(date, startTime, userTimezone, adminTimezone);
      const adminEndTimeData = convertTimeToTimezone(date, endTime, userTimezone, adminTimezone);
      
      const adminFormattedDate = adminTimeData ? 
        new Date(adminTimeData.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: adminTimezone
        }) : formattedDate;
      
      const adminTemplateData = {
        ...templateData,
        clientName: name,
        clientEmail: email,
        isAdmin: true,
        adminDate: adminFormattedDate,
        adminStartTime: adminTimeData?.time || startTime,
        adminEndTime: adminEndTimeData?.time || endTime,
        adminTimezone,
        clientDate: formattedDate,
        clientStartTime: startTime,
        clientEndTime: endTime,
        clientTimezone: userTimezone,
        showBothTimezones: adminTimezone !== userTimezone
      };
      
      await sendEmail({
        to: adminEmail,
        subject: `New ${sessionType} Booking`,
        template: 'admin-booking-notification',
        data: adminTemplateData
      });
      console.log('Admin notification email sent successfully');
    } catch (error) {
      console.error('Error sending admin notification email:', error);
    }
  }
  
  return true;
};

const convertTimeToTimezone = (date, time, fromTimezone, toTimezone) => {
  try {
    const dateTimeString = `${date}T${time}:00`;
    const originalDate = new Date(dateTimeString);
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(originalDate);
    const convertedDate = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;
    const convertedTime = `${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}`;
    
    return { date: convertedDate, time: convertedTime };
  } catch (error) {
    console.error('Error converting timezone:', error);
    return null;
  }
};

const getAdminTimezone = async (agentId) => {
  try {
    const appointmentSettings = await AppointmentSettings.findOne({ agentId });
    if (appointmentSettings?.timezone) {
      return appointmentSettings.timezone;
    }
    console.log(`No timezone found for agentId: ${agentId}, using UTC as fallback`);
    return 'UTC';
  } catch (error) {
    console.error('Error getting admin timezone:', error);
    return 'UTC';
  }
};