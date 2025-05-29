import AppointmentSettings from "../models/AppointmentSettingsModel.js";
import Booking from "../models/BookingModel.js";
import { errorMessage, successMessage } from "./clientController.js";
import { convertTime, formatDateToAPI, parseDateString } from "../utils/timezoneUtils.js";
import {
    createGoogleMeetEvent,
    createZoomMeeting,
    createTeamsMeeting,
    sendBookingConfirmationEmail,
    sendBookingCancellationEmail,
    sendRescheduleConfirmationEmail,
    sendRescheduleRequestEmail,
    getAdminEmailByAgentId,
    sendEmail
} from '../utils/emailUtils.js';

const convertTimeBetweenZones = (timeString, dateString, fromTimezone, toTimezone) => {
    try {
        const dateTimeString = `${dateString}T${timeString}:00`;
        const baseDate = new Date(dateTimeString);
        
        const sourceFormatter = new Intl.DateTimeFormat('en', {
            timeZone: fromTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const targetFormatter = new Intl.DateTimeFormat('en', {
            timeZone: toTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const testDate = new Date(dateString + 'T12:00:00Z');
        
        const sourceOffsetDate = new Date(testDate.toLocaleString('en-US', { timeZone: fromTimezone }));
        const sourceUTCDate = new Date(testDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const sourceOffsetMs = sourceUTCDate.getTime() - sourceOffsetDate.getTime();
        
        const targetOffsetDate = new Date(testDate.toLocaleString('en-US', { timeZone: toTimezone }));
        const targetUTCDate = new Date(testDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const targetOffsetMs = targetUTCDate.getTime() - targetOffsetDate.getTime();
        
        const offsetDiffMs = sourceOffsetMs - targetOffsetMs;
        
        const sourceDateTime = new Date(dateTimeString);
        const convertedDateTime = new Date(sourceDateTime.getTime() + offsetDiffMs);
        
        const hours = convertedDateTime.getHours().toString().padStart(2, '0');
        const minutes = convertedDateTime.getMinutes().toString().padStart(2, '0');
        const result = `${hours}:${minutes}`;
        
        return result;
        
    } catch (error) {
        console.error('Error in universal timezone conversion:', error);
        
        try {
            return convertTime(timeString, dateString, fromTimezone, toTimezone);
        } catch (fallbackError) {
            console.error('Fallback conversion also failed:', fallbackError);
            return timeString;
        }
    }
};

const convertTimeUniversal = (timeString, dateString, fromTz, toTz) => {
    try {
        const [hours, minutes] = timeString.split(':').map(Number);
        const sourceDate = new Date(dateString + 'T' + timeString + ':00');
        
        const utcTime = sourceDate.getTime();
        
        const tempDateInSource = new Date(sourceDate.toLocaleString('en-US', { timeZone: fromTz }));
        const tempDateInUTC = new Date(sourceDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const sourceOffset = tempDateInUTC.getTime() - tempDateInSource.getTime();
        
        const correctUTCTime = utcTime + sourceOffset;
        const correctDate = new Date(correctUTCTime);
        
        const targetTimeString = correctDate.toLocaleString('en-US', {
            timeZone: toTz,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const timePart = targetTimeString.split(' ')[1] || targetTimeString;
        const [targetHours, targetMinutes] = timePart.split(':');
        
        const result = `${targetHours.padStart(2, '0')}:${targetMinutes.padStart(2, '0')}`;
        return result;
        
    } catch (error) {
        console.error('Error in universal conversion method 2:', error);
        return timeString;
    }
};

const convertTimeRobust = (timeString, dateString, fromTz, toTz) => {
    try {
        const isoString = `${dateString}T${timeString}:00.000`;
        const referenceDate = new Date(dateString + 'T00:00:00.000Z');
        const utcDate = new Date(isoString + 'Z');
        
        const getTimezoneOffset = (date, tz) => {
            const utcDate = new Date(date.getTime());
            const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
            return utcDate.getTime() - tzDate.getTime();
        };
        
        const sourceOffset = getTimezoneOffset(referenceDate, fromTz);
        const targetOffset = getTimezoneOffset(referenceDate, toTz);
        
        const sourceUTCTime = utcDate.getTime() - sourceOffset;
        const targetLocalTime = sourceUTCTime + targetOffset;
        const targetDate = new Date(targetLocalTime);
        
        const hours = targetDate.getUTCHours().toString().padStart(2, '0');
        const minutes = targetDate.getUTCMinutes().toString().padStart(2, '0');
        
        const result = `${hours}:${minutes}`;
        
        return result;
        
    } catch (error) {
        console.error('Error in robust timezone conversion:', error);
        return timeString;
    }
};

const isTimeSlotAvailable = async (agentId, date, startTime, endTime, userTimezone = null) => {
    const settings = await AppointmentSettings.findOne({ agentId });
    if (!settings) {
        return false;
    }

    const businessTimezone = settings.timezone || 'UTC';
    
    let businessStartTime = startTime;
    let businessEndTime = endTime;
    
    if (userTimezone && userTimezone !== businessTimezone) {
        const dateStr = date.toISOString().split('T')[0];
        
        businessStartTime = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone) || 
                           convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone) ||
                           convertTime(startTime, dateStr, userTimezone, businessTimezone) ||
                           startTime;
                           
        businessEndTime = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone) || 
                         convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone) ||
                         convertTime(endTime, dateStr, userTimezone, businessTimezone) ||
                         endTime;
    }

    const existingBookings = await Booking.find({
        agentId,
        date,
        startTime: businessStartTime,  
        endTime: businessEndTime,     
        status: { $in: ['pending', 'confirmed'] }
    });

    if (existingBookings.length >= settings.bookingsPerSlot) {
        return false;
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleString('en-us', {
        weekday: 'long',
        timeZone: businessTimezone
    }).toLowerCase();

    const daySettings = settings.availability.find(a => a.day.toLowerCase() === dayOfWeek);
    if (!daySettings || !daySettings.available) {
        return false;
    }

    const isWithinTimeSlots = daySettings.timeSlots.some(slot => {
        const slotInRange = businessStartTime >= slot.startTime && businessEndTime <= slot.endTime;
        return slotInRange;
    });

    if (!isWithinTimeSlots) {
        return false;
    }

    const isOverlappingBreak = (settings.breaks || []).some(b => {
        const overlap = businessStartTime < b.endTime && businessEndTime > b.startTime;
        return overlap;
    });

    if (isOverlappingBreak) {
        return false;
    }

    return true;
};

export const saveAppointmentSettings = async (req) => {
    try {
        const settings = req.body;

        if (!settings.timezone) {
            settings.timezone = 'UTC';
        }

        const existingSettings = await AppointmentSettings.findOne({ agentId: settings.agentId });

        if (existingSettings) {
            const updated = await AppointmentSettings.findOneAndUpdate(
                { agentId: settings.agentId },
                settings,
                { new: true }
            );
            return await successMessage(updated);
        }

        const newSettings = new AppointmentSettings(settings);
        await newSettings.save();
        return await successMessage(newSettings);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getAppointmentSettings = async (req) => {
    try {
        const { agentId } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });
        
        if (settings) {
            const processedSettings = {
                ...settings.toObject(),
                unavailableDates: (settings.unavailableDates || []).map(unavailableDate => {
                    const processedEntry = {
                        date: unavailableDate.date,
                        allDay: unavailableDate.allDay,
                        startTime: unavailableDate.startTime,
                        endTime: unavailableDate.endTime,
                        timezone: unavailableDate.timezone,
                        isMultipleSlots: unavailableDate.isMultipleSlots,
                        timeSlots: []
                    };
                    
                    if (unavailableDate.timeSlots && Array.isArray(unavailableDate.timeSlots)) {
                        processedEntry.timeSlots = unavailableDate.timeSlots.map(slot => {
                            if (slot.startTime && slot.endTime) {
                                return {
                                    startTime: slot.startTime,
                                    endTime: slot.endTime
                                };
                            } else if (slot.start && slot.end) {
                                return {
                                    startTime: slot.start,
                                    endTime: slot.end
                                };
                            }
                            return slot; 
                        }).filter(slot => slot.startTime && slot.endTime); 
                    } else if (unavailableDate.startTime && unavailableDate.endTime && !unavailableDate.allDay) {
                        processedEntry.timeSlots = [{
                            startTime: unavailableDate.startTime,
                            endTime: unavailableDate.endTime
                        }];
                    }
                    
                    return processedEntry;
                })
            };
            
            return await successMessage(processedSettings);
        }
        
        return await successMessage(settings);
    } catch (error) {
        console.error("Error in getAppointmentSettings:", error);
        return await errorMessage(error.message);
    }
};

export const bookAppointment = async (req) => {
    try {
        const {
            agentId,
            userId,
            email,
            date,
            startTime,
            endTime,
            location,
            userTimezone,
            name,
            phone,
            notes,
            paymentId,
            paymentMethod,
            paymentAmount,
            paymentCurrency
        } = req.body;

        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        const sessionType = settings.sessionType || 'Consultation';

        let bookingDate;
        try {
            if (date.includes('-')) {
                if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                    bookingDate = parseDateString(date);
                } else {
                    bookingDate = new Date(date);
                }
            } else {
                bookingDate = new Date(date);
            }
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}`);
        }

        let businessStartTime = startTime;
        let businessEndTime = endTime;

        if (userTimezone && userTimezone !== businessTimezone) {
            const dateStr = bookingDate.toISOString().split('T')[0];
            
            businessStartTime = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone) || 
                               convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone) ||
                               convertTime(startTime, dateStr, userTimezone, businessTimezone) ||
                               startTime;
                               
            businessEndTime = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone) || 
                             convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone) ||
                             convertTime(endTime, dateStr, userTimezone, businessTimezone) ||
                             endTime;
        }

        const isAvailable = await isTimeSlotAvailable(agentId, bookingDate, startTime, endTime, userTimezone);
        if (!isAvailable) {
            try {
                const availableSlotsResponse = await getAvailableTimeSlots({
                    query: {
                        agentId,
                        date: date,
                        userTimezone
                    }
                });
                
                if (availableSlotsResponse.error === false && availableSlotsResponse.result) {
                    const requestedSlot = `${startTime}-${endTime}`;
                    const isInAvailableList = availableSlotsResponse.result.some(slot => 
                        `${slot.startTime}-${slot.endTime}` === requestedSlot
                    );
                    
                    if (!isInAvailableList) {
                        console.error('User tried to book a slot that wasn\'t offered - possible frontend/backend sync issue');
                    }
                }
            } catch (debugError) {
                console.error('Error during availability debugging:', debugError);
            }
            
            return await errorMessage("Selected time slot is not available");
        }

        const adminEmail = await getAdminEmailByAgentId(agentId);
        let meetingLink = null;
        const contactEmail = email || userId;

        try {
            if (location === 'google_meet') {
                try {
                    const userEmailToUse = contactEmail && contactEmail.trim() !== '' ? contactEmail : null;
                    const adminEmailToUse = adminEmail && adminEmail.trim() !== '' ? adminEmail : null;

                    meetingLink = await createGoogleMeetEvent({
                        date: bookingDate,
                        startTime,
                        endTime,
                        userTimezone: userTimezone || businessTimezone,
                        summary: `${sessionType} with ${name || contactEmail}`,
                        notes: notes || `${sessionType} booking`,
                        userEmail: userEmailToUse,
                        adminEmail: adminEmailToUse
                    });
                } catch (meetError) {
                    console.error('Error creating Google Meet event:', meetError);
                }
            } else if (location === 'zoom') {
                try {
                    meetingLink = await createZoomMeeting({
                        date: bookingDate,
                        startTime,
                        endTime,
                        userTimezone: userTimezone || businessTimezone,
                        summary: `${sessionType} with ${name || contactEmail}`,
                        notes: notes || `${sessionType} booking`
                    });
                } catch (zoomError) {
                    console.error('Error creating Zoom meeting:', zoomError);
                }
            } else if (location === 'teams') {
                try {
                    meetingLink = await createTeamsMeeting({
                        date: bookingDate,
                        startTime,
                        endTime,
                        userTimezone: userTimezone || businessTimezone,
                        summary: `${sessionType} with ${name || contactEmail}`,
                        notes: notes || `${sessionType} booking`
                    });
                } catch (teamsError) {
                    console.error('Error creating Teams meeting:', teamsError);
                }
            }
        } catch (meetingError) {
            console.error('General error creating meeting:', meetingError);
        }

        const booking = new Booking({
            agentId,
            userId,
            contactEmail: email || userId,
            date: bookingDate,
            startTime: businessStartTime,
            endTime: businessEndTime,
            location,
            userTimezone: userTimezone || businessTimezone,
            status: 'confirmed',
            notes,
            name,
            phone,
            meetingLink,
            sessionType,
            paymentId,
            paymentMethod,
            paymentAmount,
            paymentCurrency,
            paymentStatus: 'completed'
        });

        await booking.save();

        scheduleReminderForBooking(booking);

        try {
            const emailData = {
                email: email || userId,
                adminEmail: adminEmail,
                name: name || (email || userId).split('@')[0],
                date: bookingDate,
                startTime: startTime,
                endTime: endTime,
                location: location,
                meetingLink: booking.meetingLink,
                userTimezone: userTimezone || businessTimezone,
                notes: notes,
                sessionType: sessionType,
                paymentId,
                paymentMethod,
                paymentAmount,
                paymentCurrency,
                agentId: agentId 
            };

            const emailResult = await sendBookingConfirmationEmail(emailData);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }
        return await successMessage(booking);
    } catch (error) {
        console.error('Error in bookAppointment:', error);
        return await errorMessage(error.message);
    }
};

const splitTimeSlotByBreaks = (timeSlot, breaks) => {
    if (!breaks || breaks.length === 0) {
        return [timeSlot]; 
    }

    let segments = [{ startTime: timeSlot.startTime, endTime: timeSlot.endTime }];
    
    const sortedBreaks = breaks.sort((a, b) => {
        const aTime = timeStringToMinutes(a.startTime);
        const bTime = timeStringToMinutes(b.startTime);
        return aTime - bTime;
    });

    for (const breakTime of sortedBreaks) {
        const newSegments = [];
        
        for (const segment of segments) {
            const segmentStart = timeStringToMinutes(segment.startTime);
            const segmentEnd = timeStringToMinutes(segment.endTime);
            const breakStart = timeStringToMinutes(breakTime.startTime);
            const breakEnd = timeStringToMinutes(breakTime.endTime);
            
            if (breakStart >= segmentEnd || breakEnd <= segmentStart) {
                newSegments.push(segment);
            } else {
                if (segmentStart < breakStart) {
                    const beforeBreakEnd = minutesToTimeString(breakStart);
                    if (breakStart - segmentStart >= 15) { 
                        newSegments.push({
                            startTime: segment.startTime,
                            endTime: beforeBreakEnd
                        });
                    }
                }
                
                if (segmentEnd > breakEnd) {
                    const afterBreakStart = minutesToTimeString(breakEnd);
                    if (segmentEnd - breakEnd >= 15) { 
                        newSegments.push({
                            startTime: afterBreakStart,
                            endTime: segment.endTime
                        });
                    }
                }
            }
        }
        
        segments = newSegments;
    }
    
    return segments.filter(seg => {
        const start = timeStringToMinutes(seg.startTime);
        const end = timeStringToMinutes(seg.endTime);
        return start < end; 
    });
};

const generateSlotsForSegment = (segment, meetingDuration, bufferTime) => {
    const slots = [];
    let currentTime = segment.startTime;
    
    while (currentTime < segment.endTime) {
        const slotEnd = addMinutes(currentTime, meetingDuration);
        
        if (slotEnd <= segment.endTime) {
            slots.push({
                startTime: currentTime,
                endTime: slotEnd
            });
            
            currentTime = addMinutes(currentTime, meetingDuration + bufferTime);
        } else {
            if (slotEnd <= segment.endTime) {
                slots.push({
                    startTime: currentTime,
                    endTime: slotEnd
                });
            }
            break;
        }
    }
    
    return slots;
};

const timeStringToMinutes = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
};

const minutesToTimeString = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const generateBreakAwareSlots = (timeSlots, breaks, meetingDuration, bufferTime) => {
    const allSlots = [];
    
    for (const timeSlot of timeSlots) {
        const segments = splitTimeSlotByBreaks(timeSlot, breaks || []);
        
        for (const segment of segments) {
            const segmentSlots = generateSlotsForSegment(segment, meetingDuration, bufferTime);
            allSlots.push(...segmentSlots);
        }
    }
    
    return allSlots;
};

export const getAvailableTimeSlots = async (req) => {
    try {
        const { agentId, date, userTimezone } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        
        let selectedDate;
        try {
            if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                selectedDate = parseDateString(date);
            } else {
                selectedDate = new Date(date);
            }
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}`);
        }

        const dayOfWeek = selectedDate.toLocaleString('en-us', {
            weekday: 'long',
            timeZone: businessTimezone
        });

        const daySettings = settings.availability.find(a => a.day === dayOfWeek);

        if (!daySettings || !daySettings.available) {
            return await successMessage([]);
        }

        const unavailableEntry = settings.unavailableDates.find(slot => {
            return slot.date === date;
        });

        if (unavailableEntry && unavailableEntry.allDay) {
            return await successMessage([]);
        }

        let timeSlots = [];
        
        if (unavailableEntry && !unavailableEntry.allDay) {
            if (unavailableEntry.timeSlots && Array.isArray(unavailableEntry.timeSlots) && unavailableEntry.timeSlots.length > 0) {
                timeSlots = unavailableEntry.timeSlots.map(slot => {
                    const startTime = slot.startTime || slot.start;
                    const endTime = slot.endTime || slot.end;
                    return { startTime, endTime };
                }).filter(slot => slot.startTime && slot.endTime);
            } else if (unavailableEntry.startTime && unavailableEntry.endTime) {
                timeSlots = [{
                    startTime: unavailableEntry.startTime,
                    endTime: unavailableEntry.endTime
                }];
            } else {
                timeSlots = daySettings.timeSlots || [];
            }
        } else {
            timeSlots = daySettings.timeSlots || [];
        }

        if (timeSlots.length === 0) {
            return await successMessage([]);
        }

        let checkingDate = new Date(selectedDate.getTime());
        const formattedDate = `${checkingDate.toISOString().split('T')[0]}T00:00:00.000+00:00`;

        const bookings = await Booking.find({
            agentId,
            date: formattedDate,
            status: 'confirmed'
        });

        const bookingsMap = {};
        bookings.forEach(booking => {
            const key = `${booking.startTime}-${booking.endTime}`;
            if (!bookingsMap[key]) {
                bookingsMap[key] = 1;
            } else {
                bookingsMap[key]++;
            }
        });

        const allPossibleSlots = generateBreakAwareSlots(
            timeSlots,
            settings.breaks || [],
            settings.meetingDuration,
            settings.bufferTime
        );

        const availableSlots = [];
        const uniqueSlots = new Set();

        for (const slot of allPossibleSlots) {
            const key = `${slot.startTime}-${slot.endTime}`;
            const existingBookings = bookingsMap[key] || 0;
            const remainingBookings = settings.bookingsPerSlot - existingBookings;

            if (remainingBookings > 0) {
                let slotToAdd;
                
                if (userTimezone && userTimezone !== businessTimezone) {
                    const dateStr = selectedDate.toISOString().split('T')[0];
                    
                    const userStartTime = convertTimeUniversal(slot.startTime, dateStr, businessTimezone, userTimezone) || 
                                         convertTimeRobust(slot.startTime, dateStr, businessTimezone, userTimezone) ||
                                         convertTime(slot.startTime, dateStr, businessTimezone, userTimezone) ||
                                         slot.startTime;
                                         
                    const userEndTime = convertTimeUniversal(slot.endTime, dateStr, businessTimezone, userTimezone) || 
                                       convertTimeRobust(slot.endTime, dateStr, businessTimezone, userTimezone) ||
                                       convertTime(slot.endTime, dateStr, businessTimezone, userTimezone) ||
                                       slot.endTime;
                    
                    slotToAdd = {
                        startTime: userStartTime,
                        endTime: userEndTime
                    };
                } else {
                    slotToAdd = {
                        startTime: slot.startTime,
                        endTime: slot.endTime
                    };
                }

                const slotKey = `${slotToAdd.startTime}-${slotToAdd.endTime}`;
                
                if (!uniqueSlots.has(slotKey)) {
                    uniqueSlots.add(slotKey);
                    availableSlots.push(slotToAdd);
                }
            }
        }

        return await successMessage(availableSlots);
    } catch (error) {
        console.error('Error in getAvailableTimeSlots:', error);
        return await errorMessage(error.message);
    }
};

const addMinutes = (time, minutes) => {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins + minutes);
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const getAppointmentBookings = async (req) => {
    try {
        const { agentId } = req.query;

        if (!agentId) {
            return await errorMessage("Agent ID is required");
        }

        const now = new Date();

        const bookings = await Booking.find({ agentId }).sort({ date: 1, startTime: 1 });

        const settings = await AppointmentSettings.findOne({ agentId });
        const businessTimezone = settings?.timezone || 'UTC';

        const enriched = bookings.map(booking => {
            if (booking.status === 'cancelled') {
                return { ...booking._doc, statusLabel: 'cancelled' };
            }

            const [h, m] = booking.endTime.split(':').map(Number);
            const endDateTime = new Date(booking.date);
            endDateTime.setHours(h, m, 0, 0);

            const statusLabel = now > endDateTime ? 'completed' : 'upcoming';

            return {
                ...booking._doc,
                statusLabel,
                date: booking.date.toISOString().split('T')[0],
                businessTimezone
            };
        });

        return await successMessage(enriched);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const cancelBooking = async (req) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return await errorMessage("Booking ID is required");
        }

        const booking = await Booking.findByIdAndUpdate(
            bookingId,
            {
                status: 'cancelled',
                updatedAt: new Date()
            },
            {
                new: true,
                runValidators: false
            }
        );

        if (!booking) {
            return await errorMessage("Booking not found");
        }

        try {
            const { sendBookingCancellationEmail, getAdminEmailByAgentId } = await import('../utils/emailUtils.js');

            const adminEmail = await getAdminEmailByAgentId(booking.agentId);

            const email = booking.contactEmail || booking.userId;
            const name = booking.name || email.split('@')[0];

            const sessionType = booking.sessionType || 'Consultation';

            const emailData = {
                email: email,
                adminEmail: adminEmail,
                name: name,
                date: booking.date,
                startTime: booking.startTime,
                endTime: booking.endTime,
                userTimezone: booking.userTimezone,
                sessionType: sessionType,
                agentId: booking.agentId
            };

            sendBookingCancellationEmail(emailData).catch(err => {
                console.error('Failed to send cancellation email:', err);
            });
        } catch (emailError) {
            console.error('Error sending cancellation email:', emailError);
        }

        return await successMessage({
            message: "Booking cancelled successfully",
            booking
        });
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const getDayWiseAvailability = async (req) => {
    try {
        const { agentId, userTimezone } = req.query;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage('Appointment settings not found');
        }

        const businessTimezone = settings.timezone || 'UTC';

        const nowUTC = new Date();
        
        const nowInBusinessTZ = new Date(nowUTC.toLocaleString('en-US', { timeZone: businessTimezone }));
        const currentHour = nowInBusinessTZ.getHours();
        const currentMinute = nowInBusinessTZ.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        const todayInBusinessTZ = new Date(nowInBusinessTZ);
        todayInBusinessTZ.setHours(0, 0, 0, 0);

        const availabilityMap = {};
        
        const unavailableDatesMap = {};
        if (settings.unavailableDates && settings.unavailableDates.length > 0) {
            settings.unavailableDates.forEach(unavailable => {
                const unavailableDate = new Date(unavailable.date);
                const dateString = unavailableDate.toISOString().split('T')[0];

                if (!unavailableDatesMap[dateString]) {
                    unavailableDatesMap[dateString] = [];
                }

                if (unavailable.allDay) {
                    unavailableDatesMap[dateString].push({
                        allDay: true
                    });
                } else {
                    unavailableDatesMap[dateString].push({
                        allDay: false,
                        startTime: unavailable.startTime,
                        endTime: unavailable.endTime
                    });
                }
            });
        }

        const endDate = new Date(todayInBusinessTZ);
        endDate.setDate(todayInBusinessTZ.getDate() + 60);

        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: todayInBusinessTZ,
                $lte: endDate
            },
            status: { $in: ['pending', 'confirmed'] }
        });

        const bookingsByDate = {};
        allBookings.forEach(booking => {
            const dateStr = booking.date.toISOString().split('T')[0];
            if (!bookingsByDate[dateStr]) {
                bookingsByDate[dateStr] = [];
            }
            bookingsByDate[dateStr].push(booking);
        });

        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(todayInBusinessTZ);
            currentDate.setDate(todayInBusinessTZ.getDate() + i);

            const dateString = currentDate.toISOString().split('T')[0];
            const isToday = dateString === todayInBusinessTZ.toISOString().split('T')[0];

            const options = { weekday: 'long', timeZone: businessTimezone };
            const dayOfWeekString = currentDate.toLocaleString('en-US', options);

            if (unavailableDatesMap[dateString]) {
                const hasAllDayUnavailability = unavailableDatesMap[dateString].some(slot => slot.allDay === true);
                
                if (hasAllDayUnavailability) {
                    availabilityMap[dateString] = false;
                    continue;
                }
            }

            if (!settings.availability) {
                availabilityMap[dateString] = false;
                continue;
            }

            const daySettings = settings.availability.find(day => day.day === dayOfWeekString);

            if (!daySettings || !daySettings.available || daySettings.timeSlots.length === 0) {
                availabilityMap[dateString] = false;
                continue;
            }

            const dayBookings = bookingsByDate[dateString] || [];
            const dayUnavailability = unavailableDatesMap[dateString] || [];

            let availableSlotCount = 0;
            let totalSlotCount = 0;
            let maxSlotsPerTimeWindow = 0;

            const checkTimeSlotAvailability = (date, startTime, endTime) => {
                const [startHours, startMinutes] = startTime.split(':').map(Number);
                const [endHours, endMinutes] = endTime.split(':').map(Number);
            
                const slotStartMinutes = startHours * 60 + startMinutes;
                const slotEndMinutes = endHours * 60 + endMinutes;
            
                if (isToday && slotStartMinutes <= currentTimeInMinutes) {
                    return false;
                }
            
                const existingBookingsForSlot = dayBookings.filter(booking => 
                    booking.startTime === startTime && booking.endTime === endTime
                ).length;
                
                if (existingBookingsForSlot >= settings.bookingsPerSlot) {
                    return false;
                }
            
                const overlappingBookings = dayBookings.filter(booking => {
                    const [bookingStartHour, bookingStartMin] = booking.startTime.split(':').map(Number);
                    const [bookingEndHour, bookingEndMin] = booking.endTime.split(':').map(Number);
            
                    const bookingStartTotal = bookingStartHour * 60 + bookingStartMin;
                    const bookingEndTotal = bookingEndHour * 60 + bookingEndMin;
            
                    return (slotStartMinutes < bookingEndTotal && slotEndMinutes > bookingStartTotal);
                });
            
                if (overlappingBookings.length >= settings.bookingsPerSlot) {
                    return false;
                }
            
                const unavailabilityOverlap = dayUnavailability.some(slot => {
                    if (slot.allDay) return false;
            
                    const [unavailStartHour, unavailStartMin] = slot.startTime.split(':').map(Number);
                    const [unavailEndHour, unavailEndMin] = slot.endTime.split(':').map(Number);
            
                    const unavailStartTotal = unavailStartHour * 60 + unavailStartMin;
                    const unavailEndTotal = unavailEndHour * 60 + unavailEndMin;
            
                    return (slotStartMinutes < unavailEndTotal && slotEndMinutes > unavailStartTotal);
                });
            
                if (unavailabilityOverlap) {
                    return false;
                }
            
                return true;
            };

            for (const timeSlot of daySettings.timeSlots) {
                let currentTime = timeSlot.startTime;
                
                const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
                const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
                const windowStartMins = startHour * 60 + startMin;
                const windowEndMins = endHour * 60 + endMin;
                const windowDuration = windowEndMins - windowStartMins;
                
                const slotDuration = settings.meetingDuration + settings.bufferTime;
                const possibleSlotsInWindow = Math.floor((windowDuration - settings.meetingDuration) / slotDuration) + 1;
                
                const maxBookingsInWindow = possibleSlotsInWindow * settings.bookingsPerSlot;
                maxSlotsPerTimeWindow += maxBookingsInWindow;
                
                while (currentTime < timeSlot.endTime) {
                    const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                    if (slotEnd > timeSlot.endTime) break;

                    totalSlotCount++;
                    if (checkTimeSlotAvailability(dateString, currentTime, slotEnd)) {
                        availableSlotCount++;
                    }

                    currentTime = addMinutes(currentTime, settings.meetingDuration + settings.bufferTime);
                }
            }

            if (isToday) {
                let latestSlotEndMinutes = 0;
                
                for (const timeSlot of daySettings.timeSlots) {
                    const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
                    const endMinutes = endHour * 60 + endMin;
                    latestSlotEndMinutes = Math.max(latestSlotEndMinutes, endMinutes);
                }
                
                if (currentTimeInMinutes >= latestSlotEndMinutes - settings.meetingDuration) {
                    availableSlotCount = 0;
                }
            }

            const totalBookings = dayBookings.length;
            
            if (totalBookings >= maxSlotsPerTimeWindow) {
                availableSlotCount = 0;
            }

            availabilityMap[dateString] = availableSlotCount > 0;
        }

        return await successMessage(availabilityMap);
    } catch (error) {
        console.error("Error in getDayWiseAvailability:", error);
        return await errorMessage(error.message);
    }
};

export const updateUnavailableDates = async (req) => {
    try {
        const { agentId, unavailableDates, datesToMakeAvailable } = req.body;
        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage('Appointment settings not found for this agent');
        }

        let updatedUnavailableDates = settings.unavailableDates ? 
            settings.unavailableDates.map(item => ({
                date: item.date,
                allDay: item.allDay,
                startTime: item.startTime,
                endTime: item.endTime,
                timezone: item.timezone,
                timeSlots: item.timeSlots || [],
                isMultipleSlots: item.isMultipleSlots || false
            })) : [];

        if (datesToMakeAvailable && Array.isArray(datesToMakeAvailable)) {
            updatedUnavailableDates = updatedUnavailableDates.filter(d => 
                !datesToMakeAvailable.includes(d.date)
            );
        }

        if (unavailableDates && Array.isArray(unavailableDates)) {
            for (const entry of unavailableDates) {
                updatedUnavailableDates = updatedUnavailableDates.filter(d => 
                    d.date !== entry.date
                );

                const newEntry = {
                    date: entry.date,
                    allDay: Boolean(entry.allDay),
                    startTime: entry.startTime || null,
                    endTime: entry.endTime || null,
                    timezone: entry.timezone || 'UTC',
                    isMultipleSlots: Boolean(entry.isMultipleSlots),
                    timeSlots: []
                };

                if (entry.timeSlots && Array.isArray(entry.timeSlots)) {
                    newEntry.timeSlots = entry.timeSlots.map(slot => ({
                        startTime: slot.startTime,
                        endTime: slot.endTime
                    }));
                }

                updatedUnavailableDates.push(newEntry);
            }
        }

        const result = await settings.collection.updateOne(
            { agentId: agentId },
            {
                $set: {
                    unavailableDates: updatedUnavailableDates,
                    updatedAt: new Date()
                }
            }
        );

        if (result.modifiedCount > 0) {
            const updatedSettings = await AppointmentSettings.findOne({ agentId });
            
            return await successMessage({
                message: 'Unavailable dates updated successfully',
                unavailableDates: updatedSettings.unavailableDates,
                totalEntries: updatedSettings.unavailableDates.length
            });
        } else {
            throw new Error("No documents were modified");
        }

    } catch (error) {
        console.error("Error in updateUnavailableDates:", error);
        return await errorMessage(`Failed to update: ${error.message}`);
    }
};

export const getUserBookingHistory = async (req) => {
    try {
        const { userId, agentId } = req.query;

        if (!userId) {
            return await errorMessage("User ID is required");
        }

        const query = { userId };

        if (agentId) {
            query.agentId = agentId;
        }

        const bookings = await Booking.find(query).sort({ date: -1, startTime: 1 });

        const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
            const settings = await AppointmentSettings.findOne({ agentId: booking.agentId });
            const businessTimezone = settings?.timezone || 'UTC';

            const now = new Date();
            const [h, m] = booking.endTime.split(':').map(Number);
            const endDateTime = new Date(booking.date);
            endDateTime.setHours(h, m, 0, 0);

            let statusLabel;
            let enrichedBooking = { ...booking._doc };

            if (booking.status === 'cancelled' && booking.isRescheduled) {
                statusLabel = 'rescheduled';

                enrichedBooking.rescheduledFrom = {
                    date: booking.date,
                    startTime: booking.startTime,
                    endTime: booking.endTime
                };

                let currentBookingId = booking.rescheduledTo;
                let finalBooking = null;

                while (currentBookingId) {
                    const nextBooking = await Booking.findById(currentBookingId);
                    if (nextBooking) {
                        if (nextBooking.status !== 'cancelled') {
                            finalBooking = nextBooking;
                            break;
                        } else if (nextBooking.rescheduledTo) {
                            currentBookingId = nextBooking.rescheduledTo;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                if (finalBooking) {
                    enrichedBooking.rescheduledToData = {
                        date: finalBooking.date,
                        startTime: finalBooking.startTime,
                        endTime: finalBooking.endTime
                    };
                }
            } else if (booking.status === 'cancelled') {
                statusLabel = 'cancelled';
            } else {
                statusLabel = now > endDateTime ? 'completed' : 'upcoming';
            }

            return {
                ...enrichedBooking,
                statusLabel,
                date: booking.date.toISOString().split('T')[0],
                businessTimezone,
                canJoin: statusLabel === 'upcoming' && booking.meetingLink &&
                    ['google_meet', 'zoom', 'teams'].includes(booking.location)
            };
        }));

        return await successMessage(enrichedBookings);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

export const userRescheduleBooking = async (req) => {
    try {
        const {
            bookingId,
            userId,
            date,
            startTime,
            endTime,
            location,
            userTimezone,
            notes
        } = req.body;

        const originalBooking = await Booking.findById(bookingId);

        if (!originalBooking) {
            return await errorMessage("Booking not found");
        }

        if (originalBooking.userId !== userId) {
            return await errorMessage("You are not authorized to reschedule this booking");
        }

        if (originalBooking.status === 'cancelled') {
            return await errorMessage("Cannot reschedule a cancelled booking");
        }

        const now = new Date();
        const bookingDateTime = new Date(originalBooking.date);
        const [hours, minutes] = originalBooking.startTime.split(':').map(Number);
        bookingDateTime.setHours(hours, minutes, 0, 0);

        if (bookingDateTime < now) {
            return await errorMessage("Cannot reschedule past bookings");
        }
        
        const settings = await AppointmentSettings.findOne({ agentId: originalBooking.agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        let businessStartTime = startTime;
        let businessEndTime = endTime;
        let newBookingDate;
        
        try {
            if (date.includes('-')) {
                if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                    newBookingDate = parseDateString(date);
                } else {
                    newBookingDate = new Date(date);
                }
            } else {
                newBookingDate = new Date(date);
            }
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}`);
        }

        if (userTimezone && userTimezone !== businessTimezone) {
            const dateStr = newBookingDate.toISOString().split('T')[0];
            businessStartTime = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone) || 
                               convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone) ||
                               convertTime(startTime, dateStr, userTimezone, businessTimezone) ||
                               startTime;
                               
            businessEndTime = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone) || 
                             convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone) ||
                             convertTime(endTime, dateStr, userTimezone, businessTimezone) ||
                             endTime;
        }
        
        const isAvailable = await isTimeSlotAvailable(
            originalBooking.agentId,
            newBookingDate,
            startTime,
            endTime,
            userTimezone
        );

        if (!isAvailable) {
            return await errorMessage("Selected time slot is not available");
        }

        const adminEmail = await getAdminEmailByAgentId(originalBooking.agentId);

        originalBooking.status = 'cancelled';
        originalBooking.updatedAt = new Date();
        await originalBooking.save();

        let meetingLink = null;
        const sessionType = settings.sessionType || originalBooking.sessionType || 'Consultation';

        if (location === 'google_meet') {
            try {
                meetingLink = await createGoogleMeetEvent({
                    date: newBookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `${sessionType} with ${originalBooking.name || originalBooking.contactEmail}`,
                    notes: notes || `Rescheduled ${sessionType}`,
                    userEmail: originalBooking.contactEmail,
                    adminEmail: adminEmail
                });
            } catch (meetError) {
                console.error('Error creating Google Meet event:', meetError);
            }
        } else if (location === 'zoom') {
            try {
                meetingLink = await createZoomMeeting({
                    date: newBookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `${sessionType} with ${originalBooking.name || originalBooking.contactEmail}`,
                    notes: notes || `Rescheduled ${sessionType}`
                });
            } catch (zoomError) {
                console.error('Error creating Zoom meeting:', zoomError);
            }
        } else if (location === 'teams') {
            try {
                meetingLink = await createTeamsMeeting({
                    date: newBookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `${sessionType} with ${originalBooking.name || originalBooking.contactEmail}`,
                    notes: notes || `Rescheduled ${sessionType}`
                });
            } catch (teamsError) {
                console.error('Error creating Teams meeting:', teamsError);
            }
        }

        const newBooking = new Booking({
            agentId: originalBooking.agentId,
            userId: originalBooking.userId,
            contactEmail: originalBooking.contactEmail,
            date: newBookingDate,
            startTime: businessStartTime,
            endTime: businessEndTime,
            location,
            userTimezone: userTimezone || businessTimezone,
            status: 'confirmed',
            notes: notes || originalBooking.notes,
            name: originalBooking.name,
            phone: originalBooking.phone,
            meetingLink,
            sessionType: originalBooking.sessionType,
            rescheduledFrom: {
                bookingId: originalBooking._id,
                date: originalBooking.date,
                startTime: originalBooking.startTime,
                endTime: originalBooking.endTime
            }
        });

        await newBooking.save();

        originalBooking.status = 'cancelled';
        originalBooking.isRescheduled = true;
        originalBooking.rescheduledTo = newBooking._id;
        originalBooking.rescheduledDate = new Date();
        originalBooking.updatedAt = new Date();
        await originalBooking.save();

        try {
            await sendRescheduleConfirmationEmail({
                email: originalBooking.contactEmail,
                adminEmail: adminEmail,
                name: originalBooking.name || originalBooking.contactEmail.split('@')[0],
                originalDate: originalBooking.date,
                originalStartTime: originalBooking.startTime,
                originalEndTime: originalBooking.endTime,
                newDate: newBookingDate,
                newStartTime: startTime,
                newEndTime: endTime,
                location: location,
                meetingLink: newBooking.meetingLink,
                userTimezone: userTimezone || businessTimezone,
                sessionType: sessionType
            });
        } catch (emailError) {
            console.error('Error sending reschedule confirmation email:', emailError);
        }

        return await successMessage({
            message: "Booking rescheduled successfully",
            originalBookingId: originalBooking._id,
            newBooking: newBooking
        });
    } catch (error) {
        console.error('Error in userRescheduleBooking:', error);
        return await errorMessage(error.message);
    }
};

export const getBookingForReschedule = async (req) => {
    try {
        const { bookingId, userId } = req.query;

        if (!bookingId || !userId) {
            return await errorMessage("Booking ID and User ID are required");
        }

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return await errorMessage("Booking not found");
        }

        if (booking.userId !== userId) {
            return await errorMessage("You are not authorized to view this booking");
        }

        if (booking.status === 'cancelled') {
            return await errorMessage("Cannot reschedule a cancelled booking");
        }

        const now = new Date();
        const bookingDateTime = new Date(booking.date);
        const [hours, minutes] = booking.startTime.split(':').map(Number);
        bookingDateTime.setHours(hours, minutes, 0, 0);

        if (bookingDateTime < now) {
            return await errorMessage("Cannot reschedule past bookings");
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const bookingWithTimezone = {
            ...booking.toObject(),
            businessTimezone: settings.timezone || 'UTC'
        };

        return await successMessage({
            booking: bookingWithTimezone,
            settings: settings
        });
    } catch (error) {
        console.error('Error in getBookingForReschedule:', error);
        return await errorMessage(error.message);
    }
};

export const sendRescheduleRequestEmailToUser = async (req) => {
    try {
        const {
            bookingId,
            email,
            rescheduleLink,
            agentName,
            date,
            startTime,
            endTime,
            userTimezone
        } = req.body;

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return await errorMessage("Booking not found");
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId });
        const sessionType = settings?.sessionType || booking.sessionType || 'appointment';

        await sendRescheduleRequestEmail({
            email,
            adminEmail: null,
            name: booking.name || email.split('@')[0],
            date,
            startTime,
            endTime,
            userTimezone,
            rescheduleLink,
            agentName,
            sessionType
        });

        return await successMessage({
            message: "Reschedule request email sent successfully"
        });
    } catch (error) {
        console.error('Error sending reschedule request email:', error);
        return await errorMessage(error.message);
    }
};

const scheduleReminderForBooking = async (booking) => {
    try {
        if (!['google_meet', 'zoom', 'teams'].includes(booking.location)) {
            return;
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId });
        const businessTimezone = settings?.timezone || 'UTC';
        const dateStr = booking.date.toISOString().split('T')[0];
        
        const utcStartTime = convertTimeUniversal(booking.startTime, dateStr, businessTimezone, 'UTC') || 
                            convertTimeRobust(booking.startTime, dateStr, businessTimezone, 'UTC') ||
                            convertTime(booking.startTime, dateStr, businessTimezone, 'UTC') ||
                            booking.startTime;
        
        const meetingDateTime = new Date(`${dateStr}T${utcStartTime}:00.000Z`);
        const reminderTime = new Date(meetingDateTime.getTime() - (15 * 60 * 1000));
        const now = new Date();

        if (reminderTime <= now) {
            return;
        }

        const delayMs = reminderTime.getTime() - now.getTime();

        setTimeout(async () => {
            await sendReminderForBooking(booking._id);
        }, delayMs);

    } catch (error) {
        console.error('Error scheduling reminder:', error);
    }
};

const sendReminderForBooking = async (bookingId) => {
    try {
        const booking = await Booking.findById(bookingId);
        
        if (!booking || booking.status !== 'confirmed' || booking.reminderSent) {
            return;
        }

        await Booking.findByIdAndUpdate(bookingId, {
            reminderSent: true,
            reminderSentAt: new Date()
        });

        const adminEmail = await getAdminEmailByAgentId(booking.agentId);
        const sessionType = booking.sessionType || 'Consultation';
        
        const locationDisplay = {
            'google_meet': 'Google Meet',
            'zoom': 'Zoom',
            'teams': 'Microsoft Teams'
        }[booking.location] || booking.location;

        const formattedDate = new Date(booking.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: booking.userTimezone
        });

        try {
            await sendEmail({
                to: booking.contactEmail,
                subject: `Reminder: Your ${sessionType} starts in 15 minutes`,
                template: 'meeting-reminder',
                data: {
                    name: booking.name || booking.contactEmail.split('@')[0],
                    date: formattedDate,
                    startTime: booking.startTime,
                    endTime: booking.endTime,
                    location: locationDisplay,
                    meetingLink: booking.meetingLink,
                    userTimezone: booking.userTimezone,
                    sessionType: sessionType,
                    isVirtual: true,
                    currentYear: new Date().getFullYear().toString()
                }
            });
        } catch (error) {
            console.error('Error sending user reminder:', error);
        }

        if (adminEmail) {
            try {
                await sendEmail({
                    to: adminEmail,
                    subject: `Reminder: ${sessionType} with ${booking.name || booking.contactEmail} starts in 15 minutes`,
                    template: 'admin-meeting-reminder',
                    data: {
                        clientName: booking.name || booking.contactEmail.split('@')[0],
                        clientEmail: booking.contactEmail,
                        date: formattedDate,
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                        location: locationDisplay,
                        meetingLink: booking.meetingLink,
                        sessionType: sessionType,
                        adminDate: formattedDate,
                        adminStartTime: booking.startTime,
                        adminEndTime: booking.endTime,
                        adminTimezone: booking.userTimezone,
                        showBothTimezones: false,
                        isVirtual: true,
                        isAdmin: true,
                        currentYear: new Date().getFullYear().toString()
                    }
                });
            } catch (error) {
                console.error('Error sending admin reminder:', error);
            }
        }

    } catch (error) {
        console.error('Error sending reminders:', error);
    }
};

export const initializeRemindersForExistingBookings = async () => {
    try {
        const futureBookings = await Booking.find({
            status: 'confirmed',
            location: { $in: ['google_meet', 'zoom', 'teams'] },
            reminderSent: { $ne: true },
            date: { $gte: new Date() }
        });

        for (const booking of futureBookings) {
            scheduleReminderForBooking(booking);
        }
    } catch (error) {
        console.error('Error initializing reminders:', error);
    }
};