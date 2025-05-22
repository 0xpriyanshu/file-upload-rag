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

// Universal timezone conversion function that works worldwide
const convertTimeBetweenZones = (timeString, dateString, fromTimezone, toTimezone) => {
    try {
        console.log(`Converting ${timeString} from ${fromTimezone} to ${toTimezone} on ${dateString}`);
        
        // Create a date object representing the time in the source timezone
        const dateTimeString = `${dateString}T${timeString}:00`;
        
        // Create a date assuming the input is in UTC first
        const baseDate = new Date(dateTimeString);
        
        // Method 1: Using Intl.DateTimeFormat to get accurate timezone conversions
        // This creates a date-time that represents the given time AS IF it were in the source timezone
        
        // Get what this time would be in UTC if it were in the source timezone
        const tempDate = new Date(dateTimeString);
        
        // Create formatters for both timezones
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
        
        // The trick: create a date where the local time equals our input time
        // We'll use the inverse of the timezone offset to achieve this
        
        // Get current timezone offsets for the given date (accounts for DST)
        const testDate = new Date(dateString + 'T12:00:00Z'); // Use noon UTC as test
        
        // Get the offset for source timezone (in minutes from UTC)
        const sourceOffsetDate = new Date(testDate.toLocaleString('en-US', { timeZone: fromTimezone }));
        const sourceUTCDate = new Date(testDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const sourceOffsetMs = sourceUTCDate.getTime() - sourceOffsetDate.getTime();
        
        // Get the offset for target timezone (in minutes from UTC)  
        const targetOffsetDate = new Date(testDate.toLocaleString('en-US', { timeZone: toTimezone }));
        const targetUTCDate = new Date(testDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const targetOffsetMs = targetUTCDate.getTime() - targetOffsetDate.getTime();
        
        // Calculate the difference
        const offsetDiffMs = sourceOffsetMs - targetOffsetMs;
        
        // Apply the conversion
        const sourceDateTime = new Date(dateTimeString);
        const convertedDateTime = new Date(sourceDateTime.getTime() + offsetDiffMs);
        
        // Extract hours and minutes
        const hours = convertedDateTime.getHours().toString().padStart(2, '0');
        const minutes = convertedDateTime.getMinutes().toString().padStart(2, '0');
        const result = `${hours}:${minutes}`;
        
        console.log(`  Timezone conversion result: ${timeString} ${fromTimezone} → ${result} ${toTimezone}`);
        console.log(`  Source offset: ${sourceOffsetMs/1000/60} minutes, Target offset: ${targetOffsetMs/1000/60} minutes`);
        
        return result;
        
    } catch (error) {
        console.error('Error in universal timezone conversion:', error);
        console.log('Falling back to original convertTime function');
        
        // Fallback to your original function
        try {
            return convertTime(timeString, dateString, fromTimezone, toTimezone);
        } catch (fallbackError) {
            console.error('Fallback conversion also failed:', fallbackError);
            return timeString; // Last resort: return original time
        }
    }
};

// Alternative method using a more direct approach
const convertTimeUniversal = (timeString, dateString, fromTz, toTz) => {
    try {
        // Parse the input time
        const [hours, minutes] = timeString.split(':').map(Number);
        
        // Create a date object for the given date and time
        // Treat this as if it's in the source timezone
        const sourceDate = new Date(dateString + 'T' + timeString + ':00');
        
        // Convert using toLocaleString with timezone specification
        // This is the most reliable cross-platform method
        
        // Create a date that represents the correct moment in time
        // We need to adjust for the timezone difference
        
        // Get the time as if it were UTC
        const utcTime = sourceDate.getTime();
        
        // Get timezone offset for the source timezone on this date
        const tempDateInSource = new Date(sourceDate.toLocaleString('en-US', { timeZone: fromTz }));
        const tempDateInUTC = new Date(sourceDate.toLocaleString('en-US', { timeZone: 'UTC' }));
        const sourceOffset = tempDateInUTC.getTime() - tempDateInSource.getTime();
        
        // Adjust the time to represent the correct UTC moment
        const correctUTCTime = utcTime + sourceOffset;
        const correctDate = new Date(correctUTCTime);
        
        // Now convert to target timezone
        const targetTimeString = correctDate.toLocaleString('en-US', {
            timeZone: toTz,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Extract just the time part (HH:mm)
        const timePart = targetTimeString.split(' ')[1] || targetTimeString;
        const [targetHours, targetMinutes] = timePart.split(':');
        
        const result = `${targetHours.padStart(2, '0')}:${targetMinutes.padStart(2, '0')}`;
        console.log(`Universal conversion: ${timeString} ${fromTz} → ${result} ${toTz}`);
        
        return result;
        
    } catch (error) {
        console.error('Error in universal conversion method 2:', error);
        return timeString;
    }
};

// Most robust method - using the native Date constructor properly
const convertTimeRobust = (timeString, dateString, fromTz, toTz) => {
    try {
        // Create the datetime string
        const isoString = `${dateString}T${timeString}:00.000`;
        
        // The key insight: we need to create a Date object that represents
        // the moment when it's the given time in the source timezone
        
        // First, let's create a reference date to understand the timezone offsets
        const referenceDate = new Date(dateString + 'T00:00:00.000Z');
        
        // Method: Create the date as if it's UTC, then adjust for timezone differences
        const utcDate = new Date(isoString + 'Z'); // Parse as UTC
        
        // Get the offset from UTC for each timezone on this date
        const getTimezoneOffset = (date, tz) => {
            const utcDate = new Date(date.getTime());
            const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
            return utcDate.getTime() - tzDate.getTime();
        };
        
        const sourceOffset = getTimezoneOffset(referenceDate, fromTz);
        const targetOffset = getTimezoneOffset(referenceDate, toTz);
        
        // Calculate what UTC time corresponds to our local time in source timezone
        const sourceUTCTime = utcDate.getTime() - sourceOffset;
        
        // Convert that UTC time to target timezone
        const targetLocalTime = sourceUTCTime + targetOffset;
        const targetDate = new Date(targetLocalTime);
        
        // Format the result
        const hours = targetDate.getUTCHours().toString().padStart(2, '0');
        const minutes = targetDate.getUTCMinutes().toString().padStart(2, '0');
        
        const result = `${hours}:${minutes}`;
        console.log(`Robust conversion: ${timeString} ${fromTz} → ${result} ${toTz}`);
        
        return result;
        
    } catch (error) {
        console.error('Error in robust timezone conversion:', error);
        return timeString;
    }
};

// Helper function to check if a time slot is available
const isTimeSlotAvailable = async (agentId, date, startTime, endTime, userTimezone = null) => {
    console.log(`\n=== Checking availability for slot ${startTime}-${endTime} ===`);
    
    // Get agent's settings
    const settings = await AppointmentSettings.findOne({ agentId });
    if (!settings) {
        console.log("No settings found for agent");
        return false;
    }

    const businessTimezone = settings.timezone || 'UTC';
    console.log(`Business timezone: ${businessTimezone}`);
    console.log(`User timezone: ${userTimezone}`);
    
    // Convert user times to business timezone for comparison
    let businessStartTime = startTime;
    let businessEndTime = endTime;
    
    if (userTimezone && userTimezone !== businessTimezone) {
        const dateStr = date.toISOString().split('T')[0];
        
        // Try multiple conversion methods and use the most reliable one
        console.log(`\nTrying universal conversion methods:`);
        
        // Method 1: Universal method (primary)
        const universalStart = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone);
        const universalEnd = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone);
        console.log(`  Universal method: ${startTime}-${endTime} → ${universalStart}-${universalEnd}`);
        
        // Method 2: Robust method (backup)
        const robustStart = convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone);
        const robustEnd = convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone);
        console.log(`  Robust method: ${startTime}-${endTime} → ${robustStart}-${robustEnd}`);
        
        // Method 3: Original method (final fallback)
        let originalStart, originalEnd;
        try {
            originalStart = convertTime(startTime, dateStr, userTimezone, businessTimezone);
            originalEnd = convertTime(endTime, dateStr, userTimezone, businessTimezone);
            console.log(`  Original method: ${startTime}-${endTime} → ${originalStart}-${originalEnd}`);
        } catch (e) {
            console.log(`  Original method failed: ${e.message}`);
            originalStart = startTime;
            originalEnd = endTime;
        }
        
        // Use the first successful conversion
        businessStartTime = universalStart || robustStart || originalStart || startTime;
        businessEndTime = universalEnd || robustEnd || originalEnd || endTime;
        
        console.log(`  Final conversion: ${startTime}-${endTime} (${userTimezone}) → ${businessStartTime}-${businessEndTime} (${businessTimezone})`);
    }

    // Check for existing bookings using business timezone times
    const existingBookings = await Booking.find({
        agentId,
        date,
        startTime: businessStartTime,  
        endTime: businessEndTime,     
        status: { $in: ['pending', 'confirmed'] }
    });

    console.log(`Found ${existingBookings.length} existing bookings for this exact time slot`);

    // Check if we've reached the maximum bookings per slot
    if (existingBookings.length >= settings.bookingsPerSlot) {
        console.log(`Slot fully booked: ${existingBookings.length}/${settings.bookingsPerSlot}`);
        return false;
    }

    // Get the day of week in business timezone
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.toLocaleString('en-us', {
        weekday: 'long',
        timeZone: businessTimezone
    }).toLowerCase();

    console.log(`Day of week: ${dayOfWeek}`);

    // Check if day is available
    const daySettings = settings.availability.find(a => a.day.toLowerCase() === dayOfWeek);
    if (!daySettings || !daySettings.available) {
        console.log(`Day not available in settings`);
        return false;
    }

    console.log(`Day settings found with ${daySettings.timeSlots.length} time slots`);

    // Check if time is within available slots (using business timezone)
    const isWithinTimeSlots = daySettings.timeSlots.some(slot => {
        const slotInRange = businessStartTime >= slot.startTime && businessEndTime <= slot.endTime;
        console.log(`Checking slot ${slot.startTime}-${slot.endTime}: ${slotInRange ? 'MATCH' : 'no match'}`);
        return slotInRange;
    });

    if (!isWithinTimeSlots) {
        console.log(`Time slot not within available hours`);
        return false;
    }

    // Check for breaks (using business timezone)
    const isOverlappingBreak = (settings.breaks || []).some(b => {
        const overlap = businessStartTime < b.endTime && businessEndTime > b.startTime;
        if (overlap) {
            console.log(`Overlaps with break: ${b.startTime}-${b.endTime}`);
        }
        return overlap;
    });

    if (isOverlappingBreak) {
        console.log(`Time slot overlaps with a break`);
        return false;
    }

    console.log(`✅ Time slot is available!`);
    return true;
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

// Book an appointment (updated version with proper timezone handling)
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

        console.log(`\n=== BOOKING REQUEST ===`);
        console.log(`Agent: ${agentId}`);
        console.log(`Date: ${date}`);
        console.log(`Time: ${startTime}-${endTime}`);
        console.log(`User timezone: ${userTimezone}`);

        // Get agent settings to get the business timezone
        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        const sessionType = settings.sessionType || 'Consultation';
        
        console.log(`Business timezone: ${businessTimezone}`);

        // Parse the booking date
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

        console.log(`Parsed booking date: ${bookingDate.toISOString()}`);

        // Store times in business timezone for database
        let businessStartTime = startTime;
        let businessEndTime = endTime;

        if (userTimezone && userTimezone !== businessTimezone) {
            // Use date string format consistent with your system for timezone conversion
            const dateStr = bookingDate.toISOString().split('T')[0];
            
            // Use universal conversion methods with fallbacks
            businessStartTime = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone) || 
                               convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone) ||
                               convertTime(startTime, dateStr, userTimezone, businessTimezone) ||
                               startTime;
                               
            businessEndTime = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone) || 
                             convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone) ||
                             convertTime(endTime, dateStr, userTimezone, businessTimezone) ||
                             endTime;
            
            console.log(`Time conversion:`);
            console.log(`  User time: ${startTime}-${endTime} (${userTimezone})`);
            console.log(`  Business time: ${businessStartTime}-${businessEndTime} (${businessTimezone})`);
        }

        // Check if the time slot is available - pass userTimezone for proper conversion
        const isAvailable = await isTimeSlotAvailable(agentId, bookingDate, startTime, endTime, userTimezone);
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
            startTime: businessStartTime,  // Store in business timezone
            endTime: businessEndTime,      // Store in business timezone
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

        console.log(`✅ Booking saved successfully with business timezone times: ${businessStartTime}-${businessEndTime}`);

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
                startTime: startTime,  // Send original user time for email
                endTime: endTime,      // Send original user time for email
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
            console.log('Email sending result:', emailResult);
        } catch (emailError) {
            console.error('Error sending confirmation email:', emailError);
        }
        return await successMessage(booking);
    } catch (error) {
        console.error('Error in bookAppointment:', error);
        return await errorMessage(error.message);
    }
};

export const getAvailableTimeSlots = async (req) => {
    try {
        const { agentId, date, userTimezone } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        
        console.log(`\n=== GET AVAILABLE TIME SLOTS ===`);
        console.log(`Date: ${date}`);
        console.log(`Business timezone: ${businessTimezone}`);
        console.log(`User timezone: ${userTimezone}`);

        // Parse the date into a Date object
        let selectedDate;
        try {
            if (date.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
                // If it's in the DD-MMM-YYYY format
                selectedDate = parseDateString(date);
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

        console.log(`Day of week: ${dayOfWeek}`);

        const daySettings = settings.availability.find(a => a.day === dayOfWeek);

        if (!daySettings || !daySettings.available) {
            console.log(`Day not available: ${dayOfWeek}`);
            return await successMessage([]);
        }

        // Check if the date is in unavailable dates
        const isUnavailableDate = settings.unavailableDates.some(slot => {
            const unavailableDate = new Date(slot.date);
            return unavailableDate.toDateString() === selectedDate.toDateString() &&
                (slot.allDay || (slot.startTime && slot.endTime));
        });

        if (isUnavailableDate) {
            console.log(`Date marked as unavailable: ${date}`);
            return await successMessage([]);
        }

        let checkingDate = new Date(selectedDate.getTime());
        const formattedDate = `${checkingDate.toISOString().split('T')[0]}T00:00:00.000+00:00`;

        // Get all bookings for this date
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

        const availableSlots = [];
        const uniqueSlots = new Set(); 

        console.log(`\nGenerating slots from business timezone time slots:`);
        console.log(`Available time windows: ${daySettings.timeSlots.map(slot => `${slot.startTime}-${slot.endTime}`).join(', ')}`);

        for (const timeSlot of daySettings.timeSlots) {
            let currentTime = timeSlot.startTime;
            console.log(`\nProcessing time window: ${timeSlot.startTime}-${timeSlot.endTime} (${businessTimezone})`);
            
            while (currentTime < timeSlot.endTime) {
                const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                if (slotEnd > timeSlot.endTime) break;

                // Check if this time slot overlaps with any breaks
                const isOverlappingBreak = (settings.breaks || []).some(b =>
                    currentTime < b.endTime && slotEnd > b.startTime
                );

                if (!isOverlappingBreak) {
                    const key = `${currentTime}-${slotEnd}`;
                    const existingBookings = bookingsMap[key] || 0;

                    const remainingBookings = settings.bookingsPerSlot - existingBookings;

                    if (remainingBookings > 0) {
                        let slotToAdd;
                        
                        // Convert business timezone slots to user timezone
                        if (userTimezone && userTimezone !== businessTimezone) {
                            const dateStr = selectedDate.toISOString().split('T')[0];
                            
                            console.log(`Converting slot ${currentTime}-${slotEnd} from ${businessTimezone} to ${userTimezone}`);
                            
                            // Use universal conversion methods with fallbacks
                            const userStartTime = convertTimeUniversal(currentTime, dateStr, businessTimezone, userTimezone) || 
                                                 convertTimeRobust(currentTime, dateStr, businessTimezone, userTimezone) ||
                                                 convertTime(currentTime, dateStr, businessTimezone, userTimezone) ||
                                                 currentTime;
                                                 
                            const userEndTime = convertTimeUniversal(slotEnd, dateStr, businessTimezone, userTimezone) || 
                                               convertTimeRobust(slotEnd, dateStr, businessTimezone, userTimezone) ||
                                               convertTime(slotEnd, dateStr, businessTimezone, userTimezone) ||
                                               slotEnd;
                            
                            console.log(`  Result: ${currentTime}-${slotEnd} (${businessTimezone}) → ${userStartTime}-${userEndTime} (${userTimezone})`);
                            
                            slotToAdd = {
                                startTime: userStartTime,
                                endTime: userEndTime
                            };
                        } else {
                            // No conversion needed - same timezone
                            slotToAdd = {
                                startTime: currentTime,
                                endTime: slotEnd
                            };
                            
                            console.log(`  No conversion needed: ${currentTime}-${slotEnd}`);
                        }

                        const slotKey = `${slotToAdd.startTime}-${slotToAdd.endTime}`;
                        
                        if (!uniqueSlots.has(slotKey)) {
                            uniqueSlots.add(slotKey);
                            availableSlots.push(slotToAdd);
                            console.log(`  ✅ Added slot: ${slotToAdd.startTime}-${slotToAdd.endTime}`);
                        } else {
                            console.log(`  ⚠️ Duplicate slot ignored: ${slotToAdd.startTime}-${slotToAdd.endTime}`);
                        }
                    } else {
                        console.log(`  ❌ Slot ${currentTime}-${slotEnd} fully booked (${existingBookings}/${settings.bookingsPerSlot})`);
                    }
                } else {
                    console.log(`  ❌ Slot ${currentTime}-${slotEnd} overlaps with break`);
                }

                currentTime = addMinutes(currentTime, settings.meetingDuration + settings.bufferTime);
            }
        }

        console.log(`\nFinal available slots count: ${availableSlots.length}`);
        console.log(`Slots in ${userTimezone || businessTimezone}:`, availableSlots.map(slot => `${slot.startTime}-${slot.endTime}`));

        return await successMessage(availableSlots);
    } catch (error) {
        console.error('Error in getAvailableTimeSlots:', error);
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
                sessionType: sessionType,
                agentId: booking.agentId
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

        // Get current date and time in the BUSINESS timezone (not UTC)
        const nowUTC = new Date();
        
        // Convert current time to business timezone
        const nowInBusinessTZ = new Date(nowUTC.toLocaleString('en-US', { timeZone: businessTimezone }));
        const currentHour = nowInBusinessTZ.getHours();
        const currentMinute = nowInBusinessTZ.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        
        console.log(`Current UTC time: ${nowUTC.toISOString()}`);
        console.log(`Current time in business timezone (${businessTimezone}): ${currentHour}:${currentMinute} (${currentTimeInMinutes} minutes since midnight)`);

        // Get today's date in business timezone
        const todayInBusinessTZ = new Date(nowInBusinessTZ);
        todayInBusinessTZ.setHours(0, 0, 0, 0);

        const availabilityMap = {};
        
        // Create a map of unavailable dates for faster lookup
        const unavailableDatesMap = {};
        if (settings.unavailableDates && settings.unavailableDates.length > 0) {
            settings.unavailableDates.forEach(unavailable => {
                const unavailableDate = new Date(unavailable.date);
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

        // Get all bookings for the next 60 days in a single query
        const endDate = new Date(todayInBusinessTZ);
        endDate.setDate(todayInBusinessTZ.getDate() + 60);

        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: todayInBusinessTZ,
                $lte: endDate
            },
            status: { $in: ['pending', 'confirmed'] }  // Include pending bookings too
        });

        // Create a map of bookings by date for faster lookup
        const bookingsByDate = {};
        allBookings.forEach(booking => {
            const dateStr = booking.date.toISOString().split('T')[0];
            if (!bookingsByDate[dateStr]) {
                bookingsByDate[dateStr] = [];
            }
            bookingsByDate[dateStr].push(booking);
        });

        // Loop through the next 60 days
        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(todayInBusinessTZ);
            currentDate.setDate(todayInBusinessTZ.getDate() + i);

            // Format date string for the map
            const dateString = currentDate.toISOString().split('T')[0];
            const isToday = dateString === todayInBusinessTZ.toISOString().split('T')[0];

            // console.log(`\nProcessing date: ${dateString}${isToday ? ' (TODAY in ' + businessTimezone + ')' : ''}`);

            // Get day of week using the business timezone
            const options = { weekday: 'long', timeZone: businessTimezone };
            const dayOfWeekString = currentDate.toLocaleString('en-US', options);

            // Check if the date has any all-day unavailability
            if (unavailableDatesMap[dateString]) {
                const hasAllDayUnavailability = unavailableDatesMap[dateString].some(slot => slot.allDay === true);
                
                if (hasAllDayUnavailability) {
                    // console.log(`${dateString}: Marked unavailable - all day unavailability`);
                    availabilityMap[dateString] = false;
                    continue;
                }
                // console.log(`${dateString}: Has partial unavailability but will check for available slots`);
            }

            // Check if availability settings exist
            if (!settings.availability) {
                // console.log(`${dateString}: Marked unavailable - no availability settings`);
                availabilityMap[dateString] = false;
                continue;
            }

            const daySettings = settings.availability.find(day => day.day === dayOfWeekString);

            // Check if the day is available in settings
            if (!daySettings || !daySettings.available || daySettings.timeSlots.length === 0) {
                // console.log(`${dateString}: Marked unavailable - day not available in settings`);
                availabilityMap[dateString] = false;
                continue;
            }

            // Check if there are any available time slots for this day
            const dayBookings = bookingsByDate[dateString] || [];
            const dayUnavailability = unavailableDatesMap[dateString] || [];

            // For dates that might have every slot fully booked,
            // check ALL possible slots, not just stop at the first available one
            let availableSlotCount = 0;
            let totalSlotCount = 0;
            let maxSlotsPerTimeWindow = 0;

            // Create a function to check time slot availability without database query
            const checkTimeSlotAvailability = (date, startTime, endTime) => {
                // Convert times to comparable format (minutes since midnight)
                const [startHours, startMinutes] = startTime.split(':').map(Number);
                const [endHours, endMinutes] = endTime.split(':').map(Number);
            
                const slotStartMinutes = startHours * 60 + startMinutes;
                const slotEndMinutes = endHours * 60 + endMinutes;
            
                // For today, check if the slot has already passed
                if (isToday && slotStartMinutes <= currentTimeInMinutes) {
                    // console.log(`  Slot ${startTime}-${endTime} has already passed (current time: ${currentHour}:${currentMinute} in ${businessTimezone})`);
                    return false;
                }
            
                // Check if we've reached the maximum bookings per slot
                const existingBookingsForSlot = dayBookings.filter(booking => 
                    booking.startTime === startTime && booking.endTime === endTime
                ).length;
                
                if (existingBookingsForSlot >= settings.bookingsPerSlot) {
                    // console.log(`  Slot ${startTime}-${endTime} is fully booked (${existingBookingsForSlot}/${settings.bookingsPerSlot})`);
                    return false;
                }
            
                // Check if any booking overlaps with this time slot
                const overlappingBookings = dayBookings.filter(booking => {
                    const [bookingStartHour, bookingStartMin] = booking.startTime.split(':').map(Number);
                    const [bookingEndHour, bookingEndMin] = booking.endTime.split(':').map(Number);
            
                    const bookingStartTotal = bookingStartHour * 60 + bookingStartMin;
                    const bookingEndTotal = bookingEndHour * 60 + bookingEndMin;
            
                    return (slotStartMinutes < bookingEndTotal && slotEndMinutes > bookingStartTotal);
                });
            
                if (overlappingBookings.length >= settings.bookingsPerSlot) {
                    // console.log(`  Slot ${startTime}-${endTime} has too many overlapping bookings`);
                    return false;
                }
            
                // Check if any unavailable time slot overlaps with this time slot
                const unavailabilityOverlap = dayUnavailability.some(slot => {
                    // We should only check non-all-day unavailabilities here, since all-day ones are already handled
                    if (slot.allDay) return false; // Changed from true to false
            
                    const [unavailStartHour, unavailStartMin] = slot.startTime.split(':').map(Number);
                    const [unavailEndHour, unavailEndMin] = slot.endTime.split(':').map(Number);
            
                    const unavailStartTotal = unavailStartHour * 60 + unavailStartMin;
                    const unavailEndTotal = unavailEndHour * 60 + unavailEndMin;
            
                    return (slotStartMinutes < unavailEndTotal && slotEndMinutes > unavailStartTotal);
                });
            
                if (unavailabilityOverlap) {
                    // console.log(`  Slot ${startTime}-${endTime} overlaps with an unavailable period`);
                    return false;
                }
            
                // If we get here, the slot is available
                // console.log(`  Slot ${startTime}-${endTime} is available`);
                return true;
            };

            // Calculate total potential slots and the maximum slots per time window
            for (const timeSlot of daySettings.timeSlots) {
                let currentTime = timeSlot.startTime;
                
                // Calculate how many slots can fit in this time window
                const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
                const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
                const windowStartMins = startHour * 60 + startMin;
                const windowEndMins = endHour * 60 + endMin;
                const windowDuration = windowEndMins - windowStartMins;
                
                // Calculate how many slots can fit in this window
                const slotDuration = settings.meetingDuration + settings.bufferTime;
                const possibleSlotsInWindow = Math.floor((windowDuration - settings.meetingDuration) / slotDuration) + 1;
                
                // Multiply by bookings per slot to get max capacity
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

            // Check the special case: if it's today and all slots have passed
            if (isToday) {
                let latestSlotEndMinutes = 0;
                
                // Find the latest slot end time
                for (const timeSlot of daySettings.timeSlots) {
                    const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
                    const endMinutes = endHour * 60 + endMin;
                    latestSlotEndMinutes = Math.max(latestSlotEndMinutes, endMinutes);
                }
                
                // Check if current time is past the latest possible slot
                if (currentTimeInMinutes >= latestSlotEndMinutes - settings.meetingDuration) {
                    // console.log(`${dateString}: All possible slots have passed for today (current time: ${currentHour}:${currentMinute} in ${businessTimezone})`);
                    availableSlotCount = 0;
                }
            }

            // Check if all slots are booked
            const totalBookings = dayBookings.length;
            // console.log(`${dateString}: Total bookings: ${totalBookings}, Available slots: ${availableSlotCount}/${totalSlotCount}`);
            
            // Additional check for fully booked day
            if (totalBookings >= maxSlotsPerTimeWindow) {
                // console.log(`${dateString}: Day is fully booked (${totalBookings} >= ${maxSlotsPerTimeWindow})`);
                availableSlotCount = 0;
            }

            // A date is available only if there's at least one available slot
            availabilityMap[dateString] = availableSlotCount > 0;
            
            // console.log(`${dateString}: Final availability: ${availabilityMap[dateString]}`);
        }

        return await successMessage(availabilityMap);
    } catch (error) {
        console.error("Error in getDayWiseAvailability:", error);
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
        const { agentId, unavailableDates, datesToMakeAvailable } = req.body;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage('Appointment settings not found for this agent');
        }

        let updatedUnavailableDates = [...settings.unavailableDates];

        if (datesToMakeAvailable && Array.isArray(datesToMakeAvailable)) {
            for (const dateStr of datesToMakeAvailable) {
                const dateObj = new Date(dateStr);
                if (isNaN(dateObj.getTime())) {
                    return await errorMessage(`Invalid date: ${dateStr}`);
                }
                
                updatedUnavailableDates = updatedUnavailableDates.filter(
                    d => new Date(d.date).toDateString() !== dateObj.toDateString()
                );
            }
        }

        if (unavailableDates && Array.isArray(unavailableDates)) {
            for (const entry of unavailableDates) {
                const dateObj = new Date(entry.date);
                if (isNaN(dateObj.getTime())) {
                    return await errorMessage(`Invalid date: ${entry.date}`);
                }

                updatedUnavailableDates = updatedUnavailableDates.filter(
                    d => new Date(d.date).toDateString() !== dateObj.toDateString()
                );
                
                updatedUnavailableDates.push(entry);
            }
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
            businessStartTime = convertTimeUniversal(startTime, dateStr, userTimezone, businessTimezone) || 
                               convertTimeRobust(startTime, dateStr, userTimezone, businessTimezone) ||
                               convertTime(startTime, dateStr, userTimezone, businessTimezone) ||
                               startTime;
                               
            businessEndTime = convertTimeUniversal(endTime, dateStr, userTimezone, businessTimezone) || 
                             convertTimeRobust(endTime, dateStr, userTimezone, businessTimezone) ||
                             convertTime(endTime, dateStr, userTimezone, businessTimezone) ||
                             endTime;
        }
        
        // Use the updated isTimeSlotAvailable function with userTimezone parameter
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
