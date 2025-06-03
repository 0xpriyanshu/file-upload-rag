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

// Store active reminders to prevent memory leaks
const activeReminders = new Map();

// Improved timezone conversion with proper error handling
const convertTimeBetweenZones = (timeString, dateString, fromTimezone, toTimezone) => {
    if (!timeString || !dateString || !fromTimezone || !toTimezone) {
        throw new Error('Invalid parameters for timezone conversion');
    }
    
    if (fromTimezone === toTimezone) return timeString;
    
    try {
        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(timeString)) {
            throw new Error('Invalid time format. Expected HH:MM');
        }
        
        const [hours, minutes] = timeString.split(':').map(Number);
        
        // Validate time values
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new Error('Invalid time values');
        }
        
        // Normalize date string
        const dateStr = dateString.includes('T') ? dateString.split('T')[0] : dateString;
        
        // Create date object in source timezone
        const sourceDate = new Date(`${dateStr}T${timeString}:00`);
        
        // Use Intl.DateTimeFormat for more reliable timezone conversion
        const targetDate = new Date(sourceDate.toLocaleString('en-CA', { timeZone: toTimezone }));
        const sourceInTarget = new Date(sourceDate.toLocaleString('en-CA', { timeZone: fromTimezone }));
        
        // Calculate the difference and apply it
        const diff = targetDate.getTime() - sourceInTarget.getTime();
        const adjustedDate = new Date(sourceDate.getTime() + diff);
        
        const targetTime = adjustedDate.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        console.log(`🕐 ${timeString} (${fromTimezone}) → ${targetTime} (${toTimezone})`);
        return targetTime;
        
    } catch (error) {
        console.error('Timezone conversion failed:', error);
        throw new Error(`Timezone conversion failed: ${error.message}`);
    }
};

// Standardized date parsing function
const parseDate = (dateInput) => {
    if (!dateInput) {
        throw new Error('Date input is required');
    }
    
    let date;
    
    if (typeof dateInput === 'string') {
        if (dateInput.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
            // Handle DD-MMM-YYYY format
            date = parseDateString(dateInput);
        } else if (dateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Handle YYYY-MM-DD format
            date = new Date(dateInput + 'T00:00:00.000Z');
        } else {
            // Try standard parsing
            date = new Date(dateInput);
        }
    } else if (dateInput instanceof Date) {
        date = dateInput;
    } else {
        throw new Error('Invalid date format');
    }
    
    if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
    }
    
    return date;
};

// Improved input validation
const validateBookingInput = (input) => {
    const { agentId, date, startTime, endTime, email, userTimezone } = input;
    
    const errors = [];
    
    if (!agentId || typeof agentId !== 'string') {
        errors.push('Valid agent ID is required');
    }
    
    if (!date) {
        errors.push('Date is required');
    }
    
    if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
        errors.push('Valid start time is required (HH:MM format)');
    }
    
    if (!endTime || !/^\d{2}:\d{2}$/.test(endTime)) {
        errors.push('Valid end time is required (HH:MM format)');
    }
    
    if (startTime && endTime) {
        const start = timeStringToMinutes(startTime);
        const end = timeStringToMinutes(endTime);
        if (start >= end) {
            errors.push('End time must be after start time');
        }
    }
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push('Valid email is required');
    }
    
    return errors;
};

const isTimeSlotAvailable = async (agentId, date, startTime, endTime, userTimezone = null) => {
    try {
        // Input validation
        if (!agentId || !date || !startTime || !endTime) {
            throw new Error('Missing required parameters');
        }
        
        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return false;
        }

        const businessTimezone = settings.timezone || 'UTC';
        
        let businessStartTime = startTime;
        let businessEndTime = endTime;

        // Convert times if different timezones
        if (userTimezone && userTimezone !== businessTimezone) {
            const dateStr = date.toISOString().split('T')[0];
            businessStartTime = convertTimeBetweenZones(startTime, dateStr, userTimezone, businessTimezone);
            businessEndTime = convertTimeBetweenZones(endTime, dateStr, userTimezone, businessTimezone);
        }

        console.log('🔍 Checking slot availability:', {
            userSlot: `${startTime}-${endTime}`,
            businessSlot: `${businessStartTime}-${businessEndTime}`,
            userTimezone,
            businessTimezone
        });

        // Check existing bookings more efficiently
        const existingBookings = await Booking.countDocuments({
            agentId,
            date,
            startTime: businessStartTime,  
            endTime: businessEndTime,     
            status: { $in: ['pending', 'confirmed'] }
        });

        if (existingBookings >= settings.bookingsPerSlot) {
            console.log('Slot unavailable: too many bookings', existingBookings, '>=', settings.bookingsPerSlot);
            return false;
        }

        // Check day availability
        const dateObj = new Date(date);
        const dayOfWeek = dateObj.toLocaleString('en-us', {
            weekday: 'long',
            timeZone: businessTimezone
        }).toLowerCase();

        const daySettings = settings.availability?.find(a => a.day.toLowerCase() === dayOfWeek);
        if (!daySettings || !daySettings.available) {
            console.log('Day not available:', dayOfWeek);
            return false;
        }

        // Check if time is within available slots
        const isWithinTimeSlots = daySettings.timeSlots?.some(slot => {
            return businessStartTime >= slot.startTime && businessEndTime <= slot.endTime;
        });

        if (!isWithinTimeSlots) {
            console.log('Time not within available slots');
            return false;
        }

        // Check breaks
        const isOverlappingBreak = (settings.breaks || []).some(b => {
            return businessStartTime < b.endTime && businessEndTime > b.startTime;
        });

        if (isOverlappingBreak) {
            console.log('Overlapping with break time');
            return false;
        }

        console.log('Slot is available');
        return true;
    } catch (error) {
        console.error('Error checking slot availability:', error);
        return false;
    }
};

export const saveAppointmentSettings = async (req) => {
    try {
        const settings = req.body;

        // Input validation
        if (!settings.agentId) {
            return await errorMessage("Agent ID is required");
        }

        if (!settings.timezone) {
            settings.timezone = 'UTC';
        }

        // Validate timezone
        try {
            new Intl.DateTimeFormat('en', { timeZone: settings.timezone });
        } catch (error) {
            return await errorMessage("Invalid timezone");
        }

        const existingSettings = await AppointmentSettings.findOne({ agentId: settings.agentId });

        if (existingSettings) {
            const updated = await AppointmentSettings.findOneAndUpdate(
                { agentId: settings.agentId },
                { ...settings, updatedAt: new Date() },
                { new: true, runValidators: true }
            );
            return await successMessage(updated);
        }

        const newSettings = new AppointmentSettings({
            ...settings,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        await newSettings.save();
        return await successMessage(newSettings);
    } catch (error) {
        console.error('Error saving appointment settings:', error);
        return await errorMessage(error.message);
    }
};

export const getAppointmentSettings = async (req) => {
    try {
        const { agentId } = req.query;
        
        if (!agentId) {
            return await errorMessage("Agent ID is required");
        }
        
        const settings = await AppointmentSettings.findOne({ agentId });

        if (settings) {
            const processedSettings = {
                ...settings.toObject(),
                unavailableDates: (settings.unavailableDates || []).map(unavailableDate => {
                    const processedEntry = {
                        date: unavailableDate.date,
                        allDay: unavailableDate.allDay || false,
                        startTime: unavailableDate.startTime,
                        endTime: unavailableDate.endTime,
                        timezone: unavailableDate.timezone || 'UTC',
                        isMultipleSlots: unavailableDate.isMultipleSlots || false,
                        timeSlots: []
                    };

                    if (unavailableDate.timeSlots && Array.isArray(unavailableDate.timeSlots)) {
                        processedEntry.timeSlots = unavailableDate.timeSlots
                            .map(slot => {
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
                                return null;
                            })
                            .filter(slot => slot && slot.startTime && slot.endTime);
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

        return await successMessage(null);
    } catch (error) {
        console.error("Error in getAppointmentSettings:", error);
        return await errorMessage(error.message);
    }
};

export const bookAppointment = async (req) => {
    try {
        const bookingData = req.body;
        
        // Validate input
        const validationErrors = validateBookingInput(bookingData);
        if (validationErrors.length > 0) {
            return await errorMessage(`Validation errors: ${validationErrors.join(', ')}`);
        }

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
        } = bookingData;

        console.log('📝 Booking attempt:', {
            agentId,
            date,
            userStartTime: startTime,
            userEndTime: endTime,
            userTimezone,
            timestamp: new Date().toISOString()
        });

        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        const sessionType = settings.sessionType || 'Consultation';

        // Parse and validate date
        let bookingDate;
        try {
            bookingDate = parseDate(date);
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}. ${error.message}`);
        }

        const dateStr = bookingDate.toISOString().split('T')[0];

        let businessStartTime = startTime;
        let businessEndTime = endTime;

        // Convert timezone if needed
        if (userTimezone && userTimezone !== businessTimezone) {
            try {
                businessStartTime = convertTimeBetweenZones(startTime, dateStr, userTimezone, businessTimezone);
                businessEndTime = convertTimeBetweenZones(endTime, dateStr, userTimezone, businessTimezone);
            } catch (error) {
                return await errorMessage(`Timezone conversion failed: ${error.message}`);
            }
        }

        console.log('🔄 Timezone conversion:', {
            from: userTimezone,
            to: businessTimezone,
            userSlot: `${startTime}-${endTime}`,
            businessSlot: `${businessStartTime}-${businessEndTime}`
        });

        // Check availability
        const isAvailable = await isTimeSlotAvailable(agentId, bookingDate, startTime, endTime, userTimezone);
        if (!isAvailable) {
            console.log('Slot not available');
            return await errorMessage("Selected time slot is not available");
        }

        // Get admin email
        const adminEmail = await getAdminEmailByAgentId(agentId);
        let meetingLink = null;
        const contactEmail = email || userId;

        // Create meeting link based on location
        try {
            const meetingData = {
                date: bookingDate,
                startTime,
                endTime,
                userTimezone: userTimezone || businessTimezone,
                summary: `${sessionType} with ${name || contactEmail}`,
                notes: notes || `${sessionType} booking`,
                userEmail: contactEmail,
                adminEmail: adminEmail
            };

            switch (location) {
                case 'google_meet':
                    meetingLink = await createGoogleMeetEvent(meetingData);
                    break;
                case 'zoom':
                    meetingLink = await createZoomMeeting(meetingData);
                    break;
                case 'teams':
                    meetingLink = await createTeamsMeeting(meetingData);
                    break;
            }
        } catch (meetingError) {
            console.error('Error creating meeting:', meetingError);
            // Continue with booking even if meeting creation fails
        }

        // Create booking
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
            paymentStatus: paymentAmount ? 'completed' : null,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await booking.save();

        console.log('✅ Booking created successfully:', booking._id);

        // Schedule reminder
        scheduleReminderForBooking(booking);

        // Send confirmation email
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

            await sendBookingConfirmationEmail(emailData);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
            // Don't fail the booking if email fails
        }
        
        return await successMessage(booking);
    } catch (error) {
        console.error('Error in bookAppointment:', error);
        return await errorMessage(error.message);
    }
};

// Improved utility functions
const timeStringToMinutes = (timeString) => {
    if (!timeString || typeof timeString !== 'string') {
        throw new Error('Invalid time string');
    }
    
    const [hours, minutes] = timeString.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time format');
    }
    
    return hours * 60 + minutes;
};

const minutesToTimeString = (minutes) => {
    if (typeof minutes !== 'number' || minutes < 0) {
        throw new Error('Invalid minutes value');
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

const addMinutes = (time, minutes) => {
    if (!time || typeof minutes !== 'number') {
        throw new Error('Invalid parameters for addMinutes');
    }
    
    try {
        const totalMinutes = timeStringToMinutes(time) + minutes;
        return minutesToTimeString(totalMinutes);
    } catch (error) {
        console.error('Error adding minutes:', error);
        return time;
    }
};

const splitTimeSlotByBreaks = (timeSlot, breaks) => {
    if (!timeSlot || !timeSlot.startTime || !timeSlot.endTime) {
        return [];
    }
    
    if (!breaks || breaks.length === 0) {
        return [timeSlot]; 
    }

    let segments = [{ startTime: timeSlot.startTime, endTime: timeSlot.endTime }];

    const sortedBreaks = breaks
        .filter(b => b.startTime && b.endTime)
        .sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));

    for (const breakTime of sortedBreaks) {
        const newSegments = [];

        for (const segment of segments) {
            try {
                const segmentStart = timeStringToMinutes(segment.startTime);
                const segmentEnd = timeStringToMinutes(segment.endTime);
                const breakStart = timeStringToMinutes(breakTime.startTime);
                const breakEnd = timeStringToMinutes(breakTime.endTime);

                // No overlap
                if (breakStart >= segmentEnd || breakEnd <= segmentStart) {
                    newSegments.push(segment);
                } else {
                    // Split segment around break
                    if (segmentStart < breakStart) {
                        const beforeBreakEnd = minutesToTimeString(breakStart);
                        if (breakStart - segmentStart >= 15) { // Minimum 15 minute segment
                            newSegments.push({
                                startTime: segment.startTime,
                                endTime: beforeBreakEnd
                            });
                        }
                    }

                    if (segmentEnd > breakEnd) {
                        const afterBreakStart = minutesToTimeString(breakEnd);
                        if (segmentEnd - breakEnd >= 15) { // Minimum 15 minute segment
                            newSegments.push({
                                startTime: afterBreakStart,
                                endTime: segment.endTime
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error processing break:', error);
                newSegments.push(segment); // Keep original segment if processing fails
            }
        }

        segments = newSegments;
    }

    return segments.filter(seg => {
        try {
            const start = timeStringToMinutes(seg.startTime);
            const end = timeStringToMinutes(seg.endTime);
            return start < end; 
        } catch (error) {
            return false;
        }
    });
};

const generateSlotsForSegment = (segment, meetingDuration, bufferTime) => {
    if (!segment || !segment.startTime || !segment.endTime) {
        return [];
    }
    
    const slots = [];
    let currentTime = segment.startTime;

    try {
        while (currentTime < segment.endTime) {
            const slotEnd = addMinutes(currentTime, meetingDuration);

            if (slotEnd <= segment.endTime) {
                slots.push({
                    startTime: currentTime,
                    endTime: slotEnd
                });

                currentTime = addMinutes(currentTime, meetingDuration + bufferTime);
            } else {
                break;
            }
        }
    } catch (error) {
        console.error('Error generating slots for segment:', error);
    }

    return slots;
};

const generateBreakAwareSlots = (timeSlots, breaks, meetingDuration, bufferTime) => {
    if (!timeSlots || !Array.isArray(timeSlots)) {
        return [];
    }
    
    const allSlots = [];

    for (const timeSlot of timeSlots) {
        try {
            const segments = splitTimeSlotByBreaks(timeSlot, breaks || []);

            for (const segment of segments) {
                const segmentSlots = generateSlotsForSegment(segment, meetingDuration || 30, bufferTime || 0);
                allSlots.push(...segmentSlots);
            }
        } catch (error) {
            console.error('Error generating break-aware slots:', error);
        }
    }

    return allSlots;
};

export const getAvailableTimeSlots = async (req) => {
    try {
        const { agentId, date, userTimezone } = req.query;
        
        // Input validation
        if (!agentId) {
            return await errorMessage("Agent ID is required");
        }
        
        if (!date) {
            return await errorMessage("Date is required");
        }
        
        console.log('🕐 getAvailableTimeSlots called:', {
            agentId,
            date,
            userTimezone,
            timestamp: new Date().toISOString()
        });

        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';

        console.log('⚙️ Settings:', {
            businessTimezone,
            meetingDuration: settings.meetingDuration,
            bufferTime: settings.bufferTime
        });

        // Parse date
        let selectedDate;
        try {
            selectedDate = parseDate(date);
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}. ${error.message}`);
        }

        const dayOfWeek = selectedDate.toLocaleString('en-us', {
            weekday: 'long',
            timeZone: businessTimezone
        });

        const daySettings = settings.availability?.find(a => a.day === dayOfWeek);

        if (!daySettings || !daySettings.available) {
            console.log('Day not available:', dayOfWeek);
            return await successMessage([]);
        }

        // Check for unavailable dates
        const unavailableEntry = settings.unavailableDates?.find(slot => {
            return slot.date === date;
        });

        if (unavailableEntry && unavailableEntry.allDay) {
            console.log('Date unavailable (all day)');
            return await successMessage([]);
        }

        // Determine time slots
        let timeSlots = [];

        if (unavailableEntry && !unavailableEntry.allDay) {
            if (unavailableEntry.timeSlots && Array.isArray(unavailableEntry.timeSlots) && unavailableEntry.timeSlots.length > 0) {
                timeSlots = unavailableEntry.timeSlots
                    .map(slot => ({
                        startTime: slot.startTime || slot.start,
                        endTime: slot.endTime || slot.end
                    }))
                    .filter(slot => slot.startTime && slot.endTime);
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
            console.log('No time slots configured');
            return await successMessage([]);
        }

        // Get existing bookings more efficiently
        const checkingDate = new Date(selectedDate.getTime());
        const formattedDate = checkingDate.toISOString().split('T')[0];

        const bookings = await Booking.find({
            agentId,
            date: {
                $gte: new Date(formattedDate + 'T00:00:00.000Z'),
                $lt: new Date(formattedDate + 'T23:59:59.999Z')
            },
            status: 'confirmed'
        }, 'startTime endTime').lean();

        // Create bookings map for faster lookup
        const bookingsMap = {};
        bookings.forEach(booking => {
            const key = `${booking.startTime}-${booking.endTime}`;
            bookingsMap[key] = (bookingsMap[key] || 0) + 1;
        });

        // Generate all possible slots
        const allPossibleSlots = generateBreakAwareSlots(
            timeSlots,
            settings.breaks || [],
            settings.meetingDuration || 30,
            settings.bufferTime || 0
        );

        console.log('📅 Generated business timezone slots:', allPossibleSlots.map(s => `${s.startTime}-${s.endTime}`));

        const availableSlots = [];
        const uniqueSlots = new Set();

        for (const slot of allPossibleSlots) {
            try {
                const key = `${slot.startTime}-${slot.endTime}`;
                const existingBookings = bookingsMap[key] || 0;
                const remainingBookings = (settings.bookingsPerSlot || 1) - existingBookings;

                if (remainingBookings > 0) {
                    let slotToAdd;

                    if (userTimezone && userTimezone !== businessTimezone) {
                        const dateStr = selectedDate.toISOString().split('T')[0];

                        const userStartTime = convertTimeBetweenZones(slot.startTime, dateStr, businessTimezone, userTimezone);
                        const userEndTime = convertTimeBetweenZones(slot.endTime, dateStr, businessTimezone, userTimezone);

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
            } catch (error) {
                console.error('Error processing slot:', error);
            }
        }

        console.log('Returning available slots (user timezone):', availableSlots.map(s => `${s.startTime}-${s.endTime}`));

        return await successMessage(availableSlots);
    } catch (error) {
        console.error('Error in getAvailableTimeSlots:', error);
        return await errorMessage(error.message);
    }
};

export const getAppointmentBookings = async (req) => {
    try {
        const { agentId } = req.query;

        if (!agentId) {
            return await errorMessage("Agent ID is required");
        }

        console.log('Fetching bookings for agent:', agentId);

        const now = new Date();

        const bookings = await Booking.find({ agentId })
            .sort({ date: 1, startTime: 1 })
            .lean();

        console.log('Raw bookings found:', bookings.length);

        const settings = await AppointmentSettings.findOne({ agentId }).lean();
        const businessTimezone = settings?.timezone || 'UTC';

        const enriched = bookings.map(booking => {
            try {
                if (booking.status === 'cancelled') {
                    return { 
                        ...booking, 
                        statusLabel: 'cancelled',
                        date: booking.date.toISOString().split('T')[0],
                        businessTimezone
                    };
                }

                const [h, m] = booking.endTime.split(':').map(Number);
                const endDateTime = new Date(booking.date);
                endDateTime.setHours(h, m, 0, 0);

                const statusLabel = now > endDateTime ? 'completed' : 'upcoming';

                return {
                    ...booking,
                    statusLabel,
                    date: booking.date.toISOString().split('T')[0],
                    businessTimezone
                };
            } catch (error) {
                console.error('Error enriching booking:', error);
                return {
                    ...booking,
                    statusLabel: 'unknown',
                    date: booking.date ? booking.date.toISOString().split('T')[0] : null,
                    businessTimezone
                };
            }
        });

        console.log('📋 Enriched bookings:', enriched.map(b => ({
            id: b._id,
            date: b.date,
            startTime: b.startTime,
            endTime: b.endTime,
            status: b.status,
            statusLabel: b.statusLabel
        })));

        return await successMessage(enriched);
    } catch (error) {
        console.error('❌ Error fetching bookings:', error);
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

        // Cancel reminder if exists
        if (activeReminders.has(bookingId)) {
            clearTimeout(activeReminders.get(bookingId));
            activeReminders.delete(bookingId);
        }

        // Send cancellation email
        try {
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
        console.error('Error in cancelBooking:', error);
        return await errorMessage(error.message);
    }
};

export const getDayWiseAvailability = async (req) => {
    try {
        const { agentId, userTimezone } = req.query;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        console.log('getDayWiseAvailability called:', { agentId, userTimezone });

        const settings = await AppointmentSettings.findOne({ agentId }).lean();

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

        // Process unavailable dates
        const unavailableDatesMap = {};
        if (settings.unavailableDates && settings.unavailableDates.length > 0) {
            settings.unavailableDates.forEach(unavailable => {
                try {
                    let unavailableDate = parseDate(unavailable.date);
                    const dateString = unavailableDate.toISOString().split('T')[0];

                    if (!unavailableDatesMap[dateString]) {
                        unavailableDatesMap[dateString] = [];
                    }

                    unavailableDatesMap[dateString].push({
                        allDay: unavailable.allDay || false,
                        startTime: unavailable.startTime,
                        endTime: unavailable.endTime
                    });
                } catch (error) {
                    console.error('Error processing unavailable date:', error);
                }
            });
        }

        const endDate = new Date(todayInBusinessTZ);
        endDate.setDate(todayInBusinessTZ.getDate() + 60);

        // Get all bookings for the date range
        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: todayInBusinessTZ,
                $lte: endDate
            },
            status: { $in: ['pending', 'confirmed'] }
        }, 'date startTime endTime').lean();

        // Group bookings by date
        const bookingsByDate = {};
        allBookings.forEach(booking => {
            const dateStr = booking.date.toISOString().split('T')[0];
            if (!bookingsByDate[dateStr]) {
                bookingsByDate[dateStr] = [];
            }
            bookingsByDate[dateStr].push(booking);
        });

        // Check availability for each day
        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(todayInBusinessTZ);
            currentDate.setDate(todayInBusinessTZ.getDate() + i);

            const dateString = currentDate.toISOString().split('T')[0];
            const isToday = dateString === todayInBusinessTZ.toISOString().split('T')[0];

            try {
                // Check if day is completely unavailable
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

                const dayOfWeekString = currentDate.toLocaleString('en-US', { 
                    weekday: 'long', 
                    timeZone: businessTimezone 
                });

                const daySettings = settings.availability.find(day => day.day === dayOfWeekString);

                if (!daySettings || !daySettings.available || !daySettings.timeSlots || daySettings.timeSlots.length === 0) {
                    availabilityMap[dateString] = false;
                    continue;
                }

                const dayBookings = bookingsByDate[dateString] || [];
                const dayUnavailability = unavailableDatesMap[dateString] || [];

                // Generate all possible slots for the day
                const allPossibleSlots = generateBreakAwareSlots(
                    daySettings.timeSlots,
                    settings.breaks || [],
                    settings.meetingDuration || 30,
                    settings.bufferTime || 0
                );

                let availableSlotCount = 0;

                for (const slot of allPossibleSlots) {
                    try {
                        const [startHours, startMinutes] = slot.startTime.split(':').map(Number);
                        const slotStartMinutes = startHours * 60 + startMinutes;

                        // Skip past slots for today
                        if (isToday && slotStartMinutes <= currentTimeInMinutes) {
                            continue;
                        }

                        // Check existing bookings for this slot
                        const existingBookingsForSlot = dayBookings.filter(booking => 
                            booking.startTime === slot.startTime && booking.endTime === slot.endTime
                        ).length;

                        if (existingBookingsForSlot >= (settings.bookingsPerSlot || 1)) {
                            continue;
                        }

                        // Check unavailability overlap
                        const unavailabilityOverlap = dayUnavailability.some(unavailSlot => {
                            if (unavailSlot.allDay) return false;

                            try {
                                const [unavailStartHour, unavailStartMin] = unavailSlot.startTime.split(':').map(Number);
                                const [unavailEndHour, unavailEndMin] = unavailSlot.endTime.split(':').map(Number);

                                const unavailStartTotal = unavailStartHour * 60 + unavailStartMin;
                                const unavailEndTotal = unavailEndHour * 60 + unavailEndMin;
                                const [slotEndHour, slotEndMin] = slot.endTime.split(':').map(Number);
                                const slotEndMinutes = slotEndHour * 60 + slotEndMin;

                                return (slotStartMinutes < unavailEndTotal && slotEndMinutes > unavailStartTotal);
                            } catch (error) {
                                return false;
                            }
                        });

                        if (!unavailabilityOverlap) {
                            availableSlotCount++;
                        }
                    } catch (error) {
                        console.error('Error checking slot availability:', error);
                    }
                }

                availabilityMap[dateString] = availableSlotCount > 0;
            } catch (error) {
                console.error('Error processing day availability:', error);
                availabilityMap[dateString] = false;
            }
        }

        console.log('📊 Availability map generated with', Object.keys(availabilityMap).length, 'days');

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
                allDay: item.allDay || false,
                startTime: item.startTime,
                endTime: item.endTime,
                timezone: item.timezone || 'UTC',
                timeSlots: item.timeSlots || [],
                isMultipleSlots: item.isMultipleSlots || false
            })) : [];

        // Remove dates that should be made available
        if (datesToMakeAvailable && Array.isArray(datesToMakeAvailable)) {
            updatedUnavailableDates = updatedUnavailableDates.filter(d => 
                !datesToMakeAvailable.includes(d.date)
            );
        }

        // Add new unavailable dates
        if (unavailableDates && Array.isArray(unavailableDates)) {
            for (const entry of unavailableDates) {
                try {
                    // Remove existing entry for this date
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
                        newEntry.timeSlots = entry.timeSlots
                            .map(slot => ({
                                startTime: slot.startTime,
                                endTime: slot.endTime
                            }))
                            .filter(slot => slot.startTime && slot.endTime);
                    }

                    updatedUnavailableDates.push(newEntry);
                } catch (error) {
                    console.error('Error processing unavailable date entry:', error);
                }
            }
        }

        const result = await AppointmentSettings.updateOne(
            { agentId: agentId },
            {
                $set: {
                    unavailableDates: updatedUnavailableDates,
                    updatedAt: new Date()
                }
            }
        );

        if (result.modifiedCount > 0) {
            const updatedSettings = await AppointmentSettings.findOne({ agentId }).lean();

            return await successMessage({
                message: 'Unavailable dates updated successfully',
                unavailableDates: updatedSettings.unavailableDates,
                totalEntries: updatedSettings.unavailableDates.length
            });
        } else {
            return await errorMessage("No changes were made");
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

        const bookings = await Booking.find(query)
            .sort({ date: -1, startTime: 1 })
            .lean();

        const enrichedBookings = await Promise.all(bookings.map(async (booking) => {
            try {
                const settings = await AppointmentSettings.findOne({ agentId: booking.agentId }).lean();
                const businessTimezone = settings?.timezone || 'UTC';

                const now = new Date();
                const [h, m] = booking.endTime.split(':').map(Number);
                const endDateTime = new Date(booking.date);
                endDateTime.setHours(h, m, 0, 0);

                let statusLabel;
                let enrichedBooking = { ...booking };

                if (booking.status === 'cancelled' && booking.isRescheduled) {
                    statusLabel = 'rescheduled';

                    enrichedBooking.rescheduledFrom = {
                        date: booking.date,
                        startTime: booking.startTime,
                        endTime: booking.endTime
                    };

                    // Find final rescheduled booking
                    let currentBookingId = booking.rescheduledTo;
                    let finalBooking = null;

                    while (currentBookingId) {
                        const nextBooking = await Booking.findById(currentBookingId).lean();
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
            } catch (error) {
                console.error('Error enriching booking:', error);
                return {
                    ...booking,
                    statusLabel: 'unknown',
                    date: booking.date ? booking.date.toISOString().split('T')[0] : null,
                    businessTimezone: 'UTC',
                    canJoin: false
                };
            }
        }));

        return await successMessage(enrichedBookings);
    } catch (error) {
        console.error('Error in getUserBookingHistory:', error);
        return await errorMessage(error.message);
    }
};

export const userRescheduleBooking = async (req) => {
    try {
        const bookingData = req.body;
        
        // Validate input
        const validationErrors = validateBookingInput(bookingData);
        if (validationErrors.length > 0) {
            return await errorMessage(`Validation errors: ${validationErrors.join(', ')}`);
        }

        const {
            bookingId,
            userId,
            date,
            startTime,
            endTime,
            location,
            userTimezone,
            notes
        } = bookingData;

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

        // Check if booking is in the past
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
            newBookingDate = parseDate(date);
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}. ${error.message}`);
        }

        // Convert timezone if needed
        if (userTimezone && userTimezone !== businessTimezone) {
            try {
                const dateStr = newBookingDate.toISOString().split('T')[0];
                businessStartTime = convertTimeBetweenZones(startTime, dateStr, userTimezone, businessTimezone);
                businessEndTime = convertTimeBetweenZones(endTime, dateStr, userTimezone, businessTimezone);
            } catch (error) {
                return await errorMessage(`Timezone conversion failed: ${error.message}`);
            }
        }

        // Check availability for new slot
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

        // Cancel original booking
        originalBooking.status = 'cancelled';
        originalBooking.updatedAt = new Date();
        
        // Cancel reminder if exists
        if (activeReminders.has(originalBooking._id.toString())) {
            clearTimeout(activeReminders.get(originalBooking._id.toString()));
            activeReminders.delete(originalBooking._id.toString());
        }

        let meetingLink = null;
        const sessionType = settings.sessionType || originalBooking.sessionType || 'Consultation';

        // Create new meeting link
        try {
            const meetingData = {
                date: newBookingDate,
                startTime,
                endTime,
                userTimezone: userTimezone || businessTimezone,
                summary: `${sessionType} with ${originalBooking.name || originalBooking.contactEmail}`,
                notes: notes || `Rescheduled ${sessionType}`,
                userEmail: originalBooking.contactEmail,
                adminEmail: adminEmail
            };

            switch (location) {
                case 'google_meet':
                    meetingLink = await createGoogleMeetEvent(meetingData);
                    break;
                case 'zoom':
                    meetingLink = await createZoomMeeting(meetingData);
                    break;
                case 'teams':
                    meetingLink = await createTeamsMeeting(meetingData);
                    break;
            }
        } catch (meetingError) {
            console.error('Error creating meeting:', meetingError);
        }

        // Create new booking
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
            },
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await newBooking.save();

        // Update original booking with reschedule info
        originalBooking.isRescheduled = true;
        originalBooking.rescheduledTo = newBooking._id;
        originalBooking.rescheduledDate = new Date();
        await originalBooking.save();

        // Schedule reminder for new booking
        scheduleReminderForBooking(newBooking);

        // Send reschedule confirmation email
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
                sessionType: sessionType,
                agentId: originalBooking.agentId
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

        const booking = await Booking.findById(bookingId).lean();

        if (!booking) {
            return await errorMessage("Booking not found");
        }

        if (booking.userId !== userId) {
            return await errorMessage("You are not authorized to view this booking");
        }

        if (booking.status === 'cancelled') {
            return await errorMessage("Cannot reschedule a cancelled booking");
        }

        // Check if booking is in the past
        const now = new Date();
        const bookingDateTime = new Date(booking.date);
        const [hours, minutes] = booking.startTime.split(':').map(Number);
        bookingDateTime.setHours(hours, minutes, 0, 0);

        if (bookingDateTime < now) {
            return await errorMessage("Cannot reschedule past bookings");
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId }).lean();

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const bookingWithTimezone = {
            ...booking,
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

        if (!bookingId || !email) {
            return await errorMessage("Booking ID and email are required");
        }

        const booking = await Booking.findById(bookingId).lean();

        if (!booking) {
            return await errorMessage("Booking not found");
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId }).lean();
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

// Improved reminder scheduling with memory leak prevention
const scheduleReminderForBooking = async (booking) => {
    try {
        if (!['google_meet', 'zoom', 'teams'].includes(booking.location)) {
            return;
        }

        const settings = await AppointmentSettings.findOne({ agentId: booking.agentId }).lean();
        const businessTimezone = settings?.timezone || 'UTC';
        const dateStr = booking.date.toISOString().split('T')[0];

        const utcStartTime = convertTimeBetweenZones(booking.startTime, dateStr, businessTimezone, 'UTC');

        const meetingDateTime = new Date(`${dateStr}T${utcStartTime}:00.000Z`);
        const reminderTime = new Date(meetingDateTime.getTime() - (15 * 60 * 1000));
        const now = new Date();

        if (reminderTime <= now) {
            return;
        }

        const delayMs = reminderTime.getTime() - now.getTime();
        const bookingIdStr = booking._id.toString();

        // Clear existing reminder if any
        if (activeReminders.has(bookingIdStr)) {
            clearTimeout(activeReminders.get(bookingIdStr));
        }

        // Schedule new reminder
        const timeoutId = setTimeout(async () => {
            activeReminders.delete(bookingIdStr);
            await sendReminderForBooking(booking._id);
        }, delayMs);

        activeReminders.set(bookingIdStr, timeoutId);

        console.log(`Reminder scheduled for booking ${bookingIdStr} in ${Math.round(delayMs / 1000)} seconds`);

    } catch (error) {
        console.error('Error scheduling reminder:', error);
    }
};

const sendReminderForBooking = async (bookingId) => {
    try {
        const booking = await Booking.findById(bookingId).lean();

        if (!booking || booking.status !== 'confirmed' || booking.reminderSent) {
            return;
        }

        // Mark reminder as sent
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

        // Send user reminder
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

        // Send admin reminder
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
        }).lean();

        console.log(`Initializing reminders for ${futureBookings.length} existing bookings`);

        for (const booking of futureBookings) {
            scheduleReminderForBooking(booking);
        }
    } catch (error) {
        console.error('Error initializing reminders:', error);
    }
};

export const clearAllReminders = () => {
    activeReminders.forEach((timeoutId) => {
        clearTimeout(timeoutId);
    });
    activeReminders.clear();
    console.log('All active reminders cleared');
};