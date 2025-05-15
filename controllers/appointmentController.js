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
    getAdminEmailByAgentId
} from '../utils/emailUtils.js';

// Helper function to check if a time slot is available
const isTimeSlotAvailable = async (agentId, date, startTime, endTime) => {
    // Get all bookings for this time slot
    const existingBookings = await Booking.find({
        agentId,
        date,
        status: { $in: ['pending', 'confirmed'] },
        $or: [
            {
                startTime: { $lt: endTime },
                endTime: { $gt: startTime }
            }
        ]
    });

    // Get agent's settings
    const settings = await AppointmentSettings.findOne({ agentId });
    if (!settings) return false;

    // Check if we've reached the maximum bookings per slot
    if (existingBookings.length >= settings.bookingsPerSlot) {
        return false;
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleString('en-us', {
        weekday: 'long',
        timeZone: settings.timezone || 'UTC'
    }).toLowerCase();

    // Check if day is available
    const daySettings = settings.availability.find(a => a.day.toLowerCase() === dayOfWeek);
    if (!daySettings || !daySettings.available) return false;

    // Check if time is within available slots
    const isWithinTimeSlots = daySettings.timeSlots.some(slot => {
        return startTime >= slot.startTime && endTime <= slot.endTime;
    });

    const isOverlappingBreak = (settings.breaks || []).some(b =>
        startTime < b.endTime && endTime > b.startTime
    );

    return isWithinTimeSlots && !isOverlappingBreak;
};

// Save appointment settings
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

// Get appointment settings
export const getAppointmentSettings = async (req) => {
    try {
        const { agentId } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });
        return await successMessage(settings);
    } catch (error) {
        return await errorMessage(error.message);
    }
};



// Book an appointment (updated version)
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

        // Get agent settings to get the business timezone
        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        const sessionType = settings.sessionType || 'Consultation';

        // Store times in business timezone
        let businessStartTime = startTime;
        let businessEndTime = endTime;

        let bookingDate;
        try {
            if (date.includes('-')) {
                // If it's in the DD-MMM-YYYY format
                if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                    bookingDate = parseDateString(date);
                } else {
                    // Assume ISO format
                    bookingDate = new Date(date);
                }
            } else {
                bookingDate = new Date(date);
            }
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}`);
        }

        // If user timezone is provided and different from business timezone, convert times
        if (userTimezone && userTimezone !== businessTimezone) {
            // Use date string format consistent with your system for timezone conversion
            const dateStr = bookingDate.toISOString().split('T')[0];
            businessStartTime = convertTime(startTime, dateStr, userTimezone, businessTimezone);
            businessEndTime = convertTime(endTime, dateStr, userTimezone, businessTimezone);
        }

        // Check if the time slot is available
        const isAvailable = await isTimeSlotAvailable(agentId, bookingDate, businessStartTime, businessEndTime);
        if (!isAvailable) {
            return await errorMessage("Selected time slot is not available");
        }

        const adminEmail = await getAdminEmailByAgentId(agentId);
        console.log('Admin email fetched:', adminEmail);
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
                    console.log('Proceeding with booking despite Google Meet creation error');
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
                    // Continue with booking process
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

        try {
            console.log('Preparing to send emails to:', {
                user: email || userId,
                admin: adminEmail,
                meetingLink: booking.meetingLink
            });

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
                paymentCurrency
            };

            const emailResult = await sendBookingConfirmationEmail(emailData);
            console.log('Email sending result:', emailResult);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }
        return await successMessage(booking);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

// Get available time slots for a specific date
export const getAvailableTimeSlots = async (req) => {
    try {
        const { agentId, date, userTimezone } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';

        // Parse the date into a Date object
        let selectedDate;
        try {
            if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                // If it's in the DD-MMM-YYYY format
                selectedDate = parseDateString(date);
                // selectedDate = new Date(date);
            } else {
                // Assume it's an ISO date or other format JavaScript can parse
                selectedDate = new Date(date);
            }
        } catch (error) {
            return await errorMessage(`Invalid date format: ${date}`);
        }

        // Get day of week in business timezone
        const dayOfWeek = selectedDate.toLocaleString('en-us', {
            weekday: 'long',
            timeZone: businessTimezone
        });

        const daySettings = settings.availability.find(a => a.day === dayOfWeek);

        if (!daySettings || !daySettings.available) {
            return await successMessage([]);
        }

        // Check if the date is in unavailable dates
        const isUnavailableDate = settings.unavailableDates.some(slot => {
            const unavailableDate = new Date(slot.date);
            return unavailableDate.toDateString() === selectedDate.toDateString() &&
                (slot.allDay || (slot.startTime && slot.endTime));
        });

        if (isUnavailableDate) {
            return await successMessage([]);

        }

        let checkingDate = new Date(selectedDate.getTime());

        // Get all bookings for this date
        const bookings = await Booking.find({
            agentId,
            date: `${checkingDate.toISOString().split('T')[0]}T00:00:00.000+00:00`,
            status: 'confirmed'
        });


        // Generate available time slots based on settings and existing bookings
        const availableSlots = [];
        for (const timeSlot of daySettings.timeSlots) {
            let currentTime = timeSlot.startTime;
            while (currentTime < timeSlot.endTime) {
                const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                if (slotEnd > timeSlot.endTime) break;

                // Check if this time slot overlaps with any existing bookings
                const isSlotBooked = bookings.some(booking => {
                    const bookingStart = booking.startTime;
                    const bookingEnd = booking.endTime;

                    // Check for overlap
                    return (
                        (currentTime < bookingEnd && slotEnd > bookingStart)
                    );
                });

                // Skip this slot if it's already booked
                if (!isSlotBooked) {
                    const isAvailable = await isTimeSlotAvailable(agentId, selectedDate, currentTime, slotEnd);
                    if (isAvailable) {
                        // Create a time slot in business timezone
                        const businessSlot = {
                            startTime: currentTime,
                            endTime: slotEnd
                        };

                        // Return slots in user's timezone if provided and different
                        if (userTimezone && userTimezone !== businessTimezone) {
                            // Use date string format consistent with your system
                            const dateStr = selectedDate.toISOString().split('T')[0];
                            availableSlots.push({
                                startTime: convertTime(currentTime, dateStr, businessTimezone, userTimezone),
                                endTime: convertTime(slotEnd, dateStr, businessTimezone, userTimezone)
                            });
                        } else {
                            availableSlots.push(businessSlot);
                        }
                    }
                }

                currentTime = addMinutes(currentTime, settings.meetingDuration + settings.bufferTime);
            }
        }

        return await successMessage(availableSlots);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

// Helper function to add minutes to time string (HH:mm)
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

// Get appointment bookings with timezone support
export const getAppointmentBookings = async (req) => {
    try {
        const { agentId } = req.query;

        if (!agentId) {
            return await errorMessage("Agent ID is required");
        }

        const now = new Date();

        const bookings = await Booking.find({ agentId }).sort({ date: 1, startTime: 1 });

        // Get the business timezone
        const settings = await AppointmentSettings.findOne({ agentId });
        const businessTimezone = settings?.timezone || 'UTC';

        const enriched = bookings.map(booking => {
            if (booking.status === 'cancelled') {
                return { ...booking._doc, statusLabel: 'cancelled' };
            }

            // Determine if appointment is in the past
            const [h, m] = booking.endTime.split(':').map(Number);
            const endDateTime = new Date(booking.date);
            endDateTime.setHours(h, m, 0, 0);

            const statusLabel = now > endDateTime ? 'completed' : 'upcoming';

            // Return booking with status label and timezone info
            return {
                ...booking._doc,
                statusLabel,
                // Convert dates to ISO string format for consistent display
                date: booking.date.toISOString().split('T')[0],
                // Include timezone info if available
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

        // Send cancellation email
        try {
            const { sendBookingCancellationEmail, getAdminEmailByAgentId } = await import('../utils/emailUtils.js');

            // Get admin email
            const adminEmail = await getAdminEmailByAgentId(booking.agentId);

            const email = booking.contactEmail || booking.userId;
            const name = booking.name || email.split('@')[0];

            const sessionType = booking.sessionType || 'Consultation';

            // Prepare data for email
            const emailData = {
                email: email,
                adminEmail: adminEmail,
                name: name,
                date: booking.date,
                startTime: booking.startTime,
                endTime: booking.endTime,
                userTimezone: booking.userTimezone,
                sessionType: sessionType
            };

            // Send the email asynchronously (don't wait for it to complete)
            sendBookingCancellationEmail(emailData).catch(err => {
                console.error('Failed to send cancellation email:', err);
            });
        } catch (emailError) {
            // Log the error but don't fail the cancellation process
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

/**
 * Gets day-wise availability for the next 60 days
 * @param {Object} req - The request object containing agentId and userTimezone
 * @returns {Object} - Object with dates as keys and availability as boolean values
 */
 export const getDayWiseAvailability = async (req) => {
    try {
        const { agentId, userTimezone } = req.query;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        // Get agent's appointment settings
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage('Appointment settings not found');
        }

        const businessTimezone = settings.timezone || 'UTC';
        const meetingDuration = settings.meetingDuration || 45;
        const bufferTime = settings.bufferTime || 10;

        // Get today's date in the business timezone
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const availabilityMap = {};

        // Create a map of unavailable dates for faster lookup
        const unavailableDatesMap = {};
        if (settings.unavailableDates && settings.unavailableDates.length > 0) {
            settings.unavailableDates.forEach(unavailable => {
                if (!unavailable || !unavailable.date) return;
                
                // Handle the date format that looks like "17-MAY-2025"
                let unavailableDate;
                if (typeof unavailable.date === 'string' && unavailable.date.includes('-')) {
                    const parts = unavailable.date.split('-');
                    if (parts.length === 3) {
                        const months = {
                            JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
                            JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
                        };
                        const day = parseInt(parts[0], 10);
                        const month = months[parts[1]];
                        const year = parseInt(parts[2], 10);
                        
                        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
                            unavailableDate = new Date(year, month, day);
                        }
                    }
                }
                
                if (!unavailableDate) {
                    try {
                        unavailableDate = new Date(unavailable.date);
                    } catch (e) {
                        console.error(`Invalid date format: ${unavailable.date}`);
                        return;
                    }
                }
                
                if (isNaN(unavailableDate.getTime())) {
                    console.error(`Invalid date: ${unavailable.date}`);
                    return;
                }
                
                const dateString = unavailableDate.toISOString().split('T')[0];

                if (!unavailableDatesMap[dateString]) {
                    unavailableDatesMap[dateString] = [];
                }

                // If it's an all-day unavailability
                if (unavailable.allDay) {
                    unavailableDatesMap[dateString].push({
                        allDay: true
                    });
                } else {
                    // For specific time slots
                    unavailableDatesMap[dateString].push({
                        allDay: false,
                        startTime: unavailable.startTime,
                        endTime: unavailable.endTime
                    });
                }
            });
        }

        // Create lookup map for day availability
        const dayAvailabilityMap = {};
        if (settings.availability && Array.isArray(settings.availability)) {
            settings.availability.forEach(day => {
                dayAvailabilityMap[day.day.toLowerCase()] = {
                    available: day.available,
                    timeSlots: day.timeSlots || []
                };
            });
        }

        // Get all bookings for the next 60 days in a single query
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 60);

        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: today,
                $lte: endDate
            },
            status: { $in: ['confirmed', 'pending'] }
        });

        // Create a map of bookings by date for faster lookup
        const bookingsByDate = {};
        allBookings.forEach(booking => {
            let bookingDate = booking.date;
            if (typeof bookingDate === 'string') {
                bookingDate = new Date(bookingDate);
            }
            
            if (bookingDate && !isNaN(bookingDate.getTime())) {
                const dateStr = bookingDate.toISOString().split('T')[0];
                if (!bookingsByDate[dateStr]) {
                    bookingsByDate[dateStr] = [];
                }
                bookingsByDate[dateStr].push(booking);
            }
        });

        // Helper to add minutes to time
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

        // Loop through the next 60 days
        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);

            // Format date string for the map
            const dateString = currentDate.toISOString().split('T')[0];

            // Skip dates in the past
            if (currentDate < today) {
                availabilityMap[dateString] = false;
                continue;
            }

            // Check if the date has any all-day unavailability
            if (unavailableDatesMap[dateString] &&
                unavailableDatesMap[dateString].some(slot => slot.allDay)) {
                availabilityMap[dateString] = false;
                continue;
            }

            // Get day of week using the business timezone
            const options = { weekday: 'long', timeZone: businessTimezone };
            const dayOfWeekString = currentDate.toLocaleString('en-US', options);
            const dayLowerCase = dayOfWeekString.toLowerCase();

            // Check if day is available in settings
            if (!dayAvailabilityMap[dayLowerCase] || !dayAvailabilityMap[dayLowerCase].available) {
                availabilityMap[dateString] = false;
                continue;
            }

            const timeSlots = dayAvailabilityMap[dayLowerCase].timeSlots || [];
            if (timeSlots.length === 0) {
                availabilityMap[dateString] = false;
                continue;
            }

            // Check if there are any available time slots for this day
            let isAvailable = false;
            const dayBookings = bookingsByDate[dateString] || [];
            const dayUnavailability = unavailableDatesMap[dateString] || [];

            // Check time slots
            timeSlotLoop: for (const timeSlot of timeSlots) {
                let currentTime = timeSlot.startTime;
                
                while (currentTime < timeSlot.endTime) {
                    const slotEnd = addMinutes(currentTime, meetingDuration);
                    if (slotEnd > timeSlot.endTime) break;

                    // Check if this slot is fully booked
                    const overlappingBookings = dayBookings.filter(booking => {
                        // Convert time strings to minutes for easier comparison
                        const bookingStart = booking.startTime.split(':').map(Number);
                        const bookingEnd = booking.endTime.split(':').map(Number);
                        const slotStart = currentTime.split(':').map(Number);
                        const slotEndParts = slotEnd.split(':').map(Number);
                        
                        const bookingStartMins = bookingStart[0] * 60 + bookingStart[1];
                        const bookingEndMins = bookingEnd[0] * 60 + bookingEnd[1];
                        const currentTimeMins = slotStart[0] * 60 + slotStart[1];
                        const slotEndMins = slotEndParts[0] * 60 + slotEndParts[1];
                        
                        // Check for overlap
                        return (
                            (currentTimeMins < bookingEndMins && slotEndMins > bookingStartMins)
                        );
                    });

                    // Check if this slot is within an unavailable time block
                    const isUnavailableTime = dayUnavailability.some(slot => {
                        if (slot.allDay) return true;
                        
                        // Convert time strings to minutes for easier comparison
                        const unavailStart = slot.startTime.split(':').map(Number);
                        const unavailEnd = slot.endTime.split(':').map(Number);
                        const slotStart = currentTime.split(':').map(Number);
                        const slotEndParts = slotEnd.split(':').map(Number);
                        
                        const unavailStartMins = unavailStart[0] * 60 + unavailStart[1];
                        const unavailEndMins = unavailEnd[0] * 60 + unavailEnd[1];
                        const currentTimeMins = slotStart[0] * 60 + slotStart[1];
                        const slotEndMins = slotEndParts[0] * 60 + slotEndParts[1];
                        
                        // Check for overlap
                        return (
                            (currentTimeMins < unavailEndMins && slotEndMins > unavailStartMins)
                        );
                    });

                    // If there are fewer bookings than allowed per slot, and not unavailable, it's available
                    if (overlappingBookings.length < settings.bookingsPerSlot && !isUnavailableTime) {
                        isAvailable = true;
                        break timeSlotLoop;
                    }

                    // Move to next slot
                    currentTime = addMinutes(currentTime, meetingDuration + bufferTime);
                }
            }

            availabilityMap[dateString] = isAvailable;
        }

        return await successMessage(availabilityMap);
    } catch (error) {
        console.error('Error in getDayWiseAvailability:', error);
        return await errorMessage(error.message);
    }
};

/**
 * Updates the unavailable dates for an agent's appointment settings
 * @param {Object} req - The request object containing agentId and unavailableDates
 * @returns {Promise<Object>} Success or error message
 */
export const updateUnavailableDates = async (req) => {
    try {
        const { agentId, unavailableDates } = req.body;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        if (!Array.isArray(unavailableDates)) {
            return await errorMessage('Unavailable dates must be an array');
        }

        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage('Appointment settings not found for this agent');
        }

        const updatedUnavailableDates = [...settings.unavailableDates];

        for (const entry of unavailableDates) {
            const dateObj = new Date(entry.date);
            if (isNaN(dateObj.getTime())) {
                return await errorMessage(`Invalid date: ${entry.date}`);
            }

            const index = updatedUnavailableDates.findIndex(
                d => new Date(d.date).toDateString() === dateObj.toDateString()
            );
            if (index !== -1) {
                updatedUnavailableDates.splice(index, 1);
            }

            updatedUnavailableDates.push(entry);
        }

        settings.unavailableDates = updatedUnavailableDates;
        settings.updatedAt = new Date();
        await settings.save();

        return await successMessage({
            message: 'Unavailable dates updated successfully',
            unavailableDates: settings.unavailableDates
        });
    } catch (error) {
        return await errorMessage(error.message);
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
            businessStartTime = convertTime(startTime, dateStr, userTimezone, businessTimezone);
            businessEndTime = convertTime(endTime, dateStr, userTimezone, businessTimezone);
        }
        const isAvailable = await isTimeSlotAvailable(
            originalBooking.agentId,
            newBookingDate,
            businessStartTime,
            businessEndTime
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
                // Continue without meeting link rather than failing the entire operation
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