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
import { convertTime, isValidTimezone } from './timezoneUtils.js';
import User from '../models/User.js';
import AWS from 'aws-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let transporter;
let googleAuth;
let sesConfig;

export const initializeEmailService = (config) => {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  
  sesConfig = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  };

  if (process.env.USE_SES_API === 'true') {
    const ses = new AWS.SES({ apiVersion: '2010-12-01' });
    transporter = nodemailer.createTransport({
      SES: { ses, aws: AWS }
    });
  } else {
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
  
  if (config.googleCredentials) {
    const { clientId, clientSecret, redirectUri, refreshToken } = config.googleCredentials;
    
    if (clientId && clientSecret && refreshToken) {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      oauth2Client.setCredentials({ refresh_token: refreshToken });
      googleAuth = oauth2Client;
    }
  }
};

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
    
    if (cc) {
      mailOptions.cc = cc;
    }

    if (process.env.USE_SES_API === 'true') {
      mailOptions.ses = {
        Tags: [
          {
            Name: 'email_type',
            Value: template
          }
        ]
      };
    }

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

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
    
    const result = await ses.sendEmail(params).promise();
    return result;
  } catch (error) {
    console.error('Error sending email with SES API:', error);
    throw error;
  }
};

export const createGoogleMeetEvent = async (eventDetails) => {
  if (!googleAuth) {
    throw new Error('Google Calendar API is not initialized.');
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: googleAuth });

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

    return meetLink;
  } catch (error) {
    console.error('Error creating Google Meet event:', error);
    throw error;
  }
};

const getZoomAccessToken = async () => {
  try {
    const CLIENT_ID = process.env.ZOOM_CLIENT_ID;
    const CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
    const ACCOUNT_ID = process.env.ZOOM_ACCOUNT_ID;
    
    if (!CLIENT_ID || !CLIENT_SECRET || !ACCOUNT_ID) {
      throw new Error('Zoom OAuth credentials not configured');
    }
    
    const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    
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

export const createZoomMeeting = async (meetingDetails) => {
  try {
    const accessToken = await getZoomAccessToken();
    
    const meResponse = await axios.get(
      'https://api.zoom.us/v2/users/me',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const userId = meResponse.data.id;
    
    const date = new Date(meetingDetails.date);
    const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
    date.setHours(startHours, startMinutes, 0, 0);
    
    const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
    const endDate = new Date(meetingDetails.date);
    endDate.setHours(endHours, endMinutes, 0, 0);
    
    const durationInMinutes = Math.ceil((endDate - date) / (1000 * 60));
    
    const response = await axios.post(
      `https://api.zoom.us/v2/users/${userId}/meetings`,
      {
        topic: meetingDetails.summary || 'Appointment Meeting',
        type: 2,
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
  } catch (error) {
    console.error('Error creating Zoom meeting:', error.message);
    if (error.response) {
      console.error('Zoom API response:', error.response.data);
    }
    
    if (error.response && error.response.data && 
        (error.response.data.code === 4711 || error.response.data.code === 1001)) {
      try {
        const accessToken = await getZoomAccessToken();
        
        const date = new Date(meetingDetails.date);
        const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
        date.setHours(startHours, startMinutes, 0, 0);
        
        const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
        const endDate = new Date(meetingDetails.date);
        endDate.setHours(endHours, endMinutes, 0, 0);
        
        const durationInMinutes = Math.ceil((endDate - date) / (1000 * 60));
        
        const response = await axios.post(
          'https://api.zoom.us/v2/users/me/meetings',
          {
            topic: meetingDetails.summary || 'Appointment Meeting',
            type: 2,
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

export const createTeamsMeeting = async (meetingDetails) => {
  try {
    const CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID;
    const CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
    const TENANT_ID = process.env.MS_GRAPH_TENANT_ID;
    const USER_EMAIL = process.env.MS_GRAPH_USER_EMAIL;
    
    if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID || !USER_EMAIL) {
      throw new Error('Microsoft Graph API credentials not configured');
    }
    
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
    
    const startDate = new Date(meetingDetails.date);
    const [startHours, startMinutes] = meetingDetails.startTime.split(':').map(Number);
    startDate.setHours(startHours, startMinutes, 0, 0);
    
    const endDate = new Date(meetingDetails.date);
    const [endHours, endMinutes] = meetingDetails.endTime.split(':').map(Number);
    endDate.setHours(endHours, endMinutes, 0, 0);
    
    try {
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
      
      return response.data.joinWebUrl;
    } catch (error1) {
      try {
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
        
        return response.data.joinWebUrl;
      } catch (error2) {
        try {
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
            
            return response.data.joinWebUrl;
          } else {
            throw new Error('User not found with the provided email');
          }
        } catch (error3) {
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

export const sendBookingCancellationEmail = async (bookingDetails) => {
  const { email, adminEmail, name, date, startTime, endTime, userTimezone, sessionType = 'Consultation', agentId } = bookingDetails;
  
  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: userTimezone
  });

  let agentUsername = '';
  try {
    const agent = await Agent.findOne({ agentId });
    agentUsername = agent?.username || '';
  } catch (error) {
    console.error('Error fetching agent username:', error);
  }

  const templateData = {
    name,
    email,
    date: formattedDate,
    startTime,
    endTime,
    userTimezone,
    sessionType,
    username: agentUsername,
    currentYear: new Date().getFullYear().toString()
  };

  const customTemplate = await getCustomEmailTemplate(agentId, 'Calender_Booking_Cancellation');

  try {
    if (customTemplate) {
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
    } catch (error) {
      console.error('Error sending admin notification email:', error);
    }
  }
  
  return true;
};

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

  try {
    const settings = await AppointmentSettings.findOne({ agentId });
    const businessTimezone = settings?.timezone || 'UTC';
    const validUserTimezone = isValidTimezone(userTimezone) ? userTimezone : businessTimezone;

    const formattedOriginalDate = new Date(originalDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: validUserTimezone
    });

    const formattedNewDate = new Date(newDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: validUserTimezone
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
      userTimezone: validUserTimezone,
      isVirtual: ['google_meet', 'zoom', 'teams'].includes(location),
      sessionType
    };

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

    if (adminEmail) {
      const adminTimezone = await getAdminTimezone(agentId);
      
      let adminOriginalStartTime = originalStartTime;
      let adminOriginalEndTime = originalEndTime;
      let adminNewStartTime = newStartTime;
      let adminNewEndTime = newEndTime;
      
      if (validUserTimezone !== adminTimezone) {
        const originalDateStr = new Date(originalDate).toISOString().split('T')[0];
        const newDateStr = new Date(newDate).toISOString().split('T')[0];
        
        adminOriginalStartTime = convertTime(originalStartTime, originalDateStr, validUserTimezone, adminTimezone);
        adminOriginalEndTime = convertTime(originalEndTime, originalDateStr, validUserTimezone, adminTimezone);
        adminNewStartTime = convertTime(newStartTime, newDateStr, validUserTimezone, adminTimezone);
        adminNewEndTime = convertTime(newEndTime, newDateStr, validUserTimezone, adminTimezone);
      }
      
      const adminOriginalFormattedDate = new Date(originalDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: adminTimezone
      });
      
      const adminNewFormattedDate = new Date(newDate).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: adminTimezone
      });
      
      const adminTemplateData = {
        ...commonData,
        clientName: name,
        clientEmail: email,
        isAdmin: true,
        adminOriginalDate: adminOriginalFormattedDate,
        adminOriginalStartTime,
        adminOriginalEndTime,
        adminNewDate: adminNewFormattedDate,
        adminNewStartTime,
        adminNewEndTime,
        adminTimezone,
        clientOriginalDate: formattedOriginalDate,
        clientOriginalStartTime: originalStartTime,
        clientOriginalEndTime: originalEndTime,
        clientNewDate: formattedNewDate,
        clientNewStartTime: newStartTime,
        clientNewEndTime: newEndTime,
        clientTimezone: validUserTimezone,
        showBothTimezones: adminTimezone !== validUserTimezone
      };
      
      await sendEmail({
        to: adminEmail,
        subject: `${sessionType} Rescheduled`,
        template: 'admin-booking-reschedule',
        data: adminTemplateData
      });
    }

    return true;
  } catch (error) {
    console.error('Error sending reschedule confirmation email:', error);
    throw error;
  }
};

export const sendRescheduleRequestEmail = async (details) => {
  const {
    email,
    name,
    date,
    startTime,
    endTime,
    startTimeUTC,     
    endTimeUTC,       
    businessTimezone, 
    userTimezone,
    rescheduleLink,
    agentName,
    sessionType = 'appointment',
    agentId
  } = details;

  try {
    let finalStartTime, finalEndTime;
    const validUserTimezone = isValidTimezone(userTimezone) ? userTimezone : 'UTC';
    
    if (userTimezone !== validUserTimezone) {
      console.warn(`Invalid user timezone '${userTimezone}', using UTC instead`);
    }

    const dateStr = new Date(date).toISOString().split('T')[0];

    if (startTimeUTC && endTimeUTC) {
      finalStartTime = convertTime(startTimeUTC, dateStr, 'UTC', validUserTimezone);
      finalEndTime = convertTime(endTimeUTC, dateStr, 'UTC', validUserTimezone);
    }
    else if (businessTimezone && businessTimezone !== validUserTimezone && isValidTimezone(businessTimezone)) {
      finalStartTime = convertTime(startTime, dateStr, businessTimezone, validUserTimezone);
      finalEndTime = convertTime(endTime, dateStr, businessTimezone, validUserTimezone);
    }
    else {
      finalStartTime = startTime;
      finalEndTime = endTime;
    }

    if (!finalStartTime || !finalEndTime) {
      throw new Error('Could not determine valid start/end times');
    }

    const formattedDate = new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: validUserTimezone
    });

    await sendEmail({
      to: email,
      subject: `Request to Reschedule Your ${sessionType}`,
      template: 'reschedule-request',
      data: {
        name,
        date: formattedDate,
        startTime: finalStartTime,  
        endTime: finalEndTime,      
        userTimezone: validUserTimezone,
        rescheduleLink,
        agentName,
        sessionType
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error sending reschedule request email:', error);
    console.error('Failed with parameters:', { 
      email, 
      startTime, 
      endTime, 
      startTimeUTC, 
      endTimeUTC, 
      userTimezone 
    });
    throw error;
  }
};

const renderTemplate = (template, data) => {
  if (!template) return '';
  
  let processedTemplate = template.replace(/\{\{#if\s+([^}]+)\}\}(.*?)\{\{\/if\}\}/gs, (match, condition, content) => {
    const conditionValue = data[condition];
    return conditionValue && conditionValue !== "false" ? content : '';
  });
  
  return processedTemplate.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
};

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
      console.log('✅ Identified as DIGITAL PRODUCT - using template:', templateName);
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
      currentYear: currentYear.toString(),
      uploadType: primaryProduct?.uploadType || 'upload',
      isRedirectType: primaryProduct?.uploadType === 'redirect'
    };
    
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
      
      if (primaryProduct.locationType === 'online') {
        templateData.location = 'Virtual Event';
        templateData.isVirtual = true;
        templateData.meetingLink = primaryProduct.fileUrl || 'Your access link will be provided closer to the event date';
      } else {
        templateData.location = primaryProduct.address || 'In-Person Event';
        templateData.isVirtual = false;
      }
    }
    
    if (primaryProduct?.type === 'digitalProduct') {
      templateData.fileUrl = primaryProduct.fileUrl || primaryProduct.downloadUrl || '';
      templateData['hasFileUrl'] = !!templateData.fileUrl;
      
      if (primaryProduct.uploadType === 'redirect') {
        templateData.buttonText = 'Checkout Your Product';
        templateData.isRedirectType = true;
      } else {
        templateData.buttonText = 'Download Your Product';
        templateData.isRedirectType = false;
      }
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
        
        await sendEmail({
          to: email,
          subject: subject,
          template: templateName,
          data: templateData
        });
      } else {
        const subjectText = primaryProduct?.type === 'digitalProduct' ? 
                    (primaryProduct?.uploadType === 'redirect' ? 'Your Product Link is Ready!' : 'Your Digital Product is Ready!') : 
                    primaryProduct?.type === 'event' ?
                    'Your Event Registration is Confirmed' :
                    primaryProduct?.type === 'physicalProduct' ?
                    'Your Order Confirmation' :
                    'Your Service Booking Confirmation';
        
        await sendEmail({
          to: email,
          subject: subjectText,
          template: templateName,
          data: templateData
        });
      }
    } catch (error) {
      console.error('Error sending user order confirmation email:', error);
    }

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
  
  const customTemplate = await getCustomEmailTemplate(agentId, 'Event_Booking_Cancellation');

  try {
    if (customTemplate) {
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
      await sendEmail({
        to: email,
        subject: 'Your Event Registration has been Cancelled',
        template: 'event-booking-cancellation',
        data: templateData
      });
    }
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
    } catch (error) {
      console.error('Error sending admin event cancellation email:', error);
    }
  }
  
  return true;
};

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
  
  const customTemplate = await getCustomEmailTemplate(agentId, 'Calender_Booking_Confirmation');

  try {
    let emailSubject = `Your ${sessionType} is Confirmed`;
    
    if (customTemplate) {
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
    } catch (error) {
      console.error('Error sending admin notification email:', error);
    }
  }
  
  return true;
};

const convertTimeToTimezone = (date, time, fromTimezone, toTimezone) => {
  try {
    if (fromTimezone === toTimezone) {
      const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];
      return { date: dateString, time: time };
    }
    
    const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date.split('T')[0];
    const [hours, minutes] = time.split(':').map(Number);
    
    const dateTimeString = `${dateString} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
    
    const localDate = new Date(`${dateString}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`);
    
    const sourceFormatted = localDate.toLocaleString('sv-SE', { 
      timeZone: fromTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const sourceAsUTC = new Date(sourceFormatted + 'Z');
    
    const originalAsUTC = new Date(dateTimeString + ' UTC');
    const timeDiff = originalAsUTC.getTime() - sourceAsUTC.getTime();
    
    const correctUTCTime = new Date(localDate.getTime() + timeDiff);
    
    const targetFormatted = correctUTCTime.toLocaleString('en-CA', {
      timeZone: toTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const [datePart, timePart] = targetFormatted.split(', ');
    
    return {
      date: datePart,
      time: timePart
    };
  } catch (error) {
    console.error('Timezone conversion error:', error);
    return null;
  }
};

const getAdminTimezone = async (agentId) => {
  try {
    const appointmentSettings = await AppointmentSettings.findOne({ agentId });
    if (appointmentSettings?.timezone) {
      return appointmentSettings.timezone;
    }
    return 'UTC';
  } catch (error) {
    console.error('Error getting admin timezone:', error);
    return 'UTC';
  }
};

const convertAPIDateToISO = (apiDate) => {
  const months = {
    'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
    'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
  };
  
  const [day, month, year] = apiDate.split('-');
  return `${year}-${months[month]}-${day}`;
};