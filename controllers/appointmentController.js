import AppointmentSettings from "../models/AppointmentSettingsModel.js";
import Booking from "../models/BookingModel.js";
import { errorMessage, successMessage } from "./clientController.js";



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

    // Get day of week
    const dayOfWeek = new Date(date).toLocaleString('en-us', { weekday: 'long' }).toLowerCase();

    // Check if day is available
    const daySettings = settings.availability.find(a => a.day.toLowerCase() === dayOfWeek);
    if (!daySettings || !daySettings.available) return false;

    // Check if time is within available slots
    const isWithinTimeSlots = daySettings.timeSlots.some(slot => {
        return startTime >= slot.startTime && endTime <= slot.endTime;
    });

    // Check if time overlaps with lunch break
    const isLunchTime = settings.lunchBreak && 
                        startTime >= settings.lunchBreak.start && 
                        endTime <= settings.lunchBreak.end;

    return isWithinTimeSlots && !isLunchTime;
};

// Save appointment settings
export const saveAppointmentSettings = async (req) => {
    try {
        const settings = req.body;
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



// Book an appointment
export const bookAppointment = async (req) => {
    try {
        const { agentId, userId, date, startTime, endTime, location } = req.body;

        // Check if the time slot is available
        const isAvailable = await isTimeSlotAvailable(agentId, date, startTime, endTime);
        if (!isAvailable) {
            return await errorMessage("Selected time slot is not available");
        }

        // Create the booking
        const booking = new Booking({
            agentId,
            userId,
            date,
            startTime,
            endTime,
            location,
            status: 'confirmed'
        });

        // Generate meeting links based on location type
        if (location === 'google_meet') {
            booking.meetingLink = `https://meet.google.com/${Math.random().toString(36).substring(7)}`;
        } else if (location === 'zoom') {
            booking.meetingLink = `https://zoom.us/j/${Math.random().toString().substring(2, 11)}`;
        } else if (location === 'teams') {
            booking.meetingLink = `https://teams.microsoft.com/l/meetup-join/${Math.random().toString(36).substring(7)}`;
        }

        await booking.save();
        return await successMessage(booking);
    } catch (error) {
        return await errorMessage(error.message);
    }
};

// Get available time slots for a specific date
export const getAvailableTimeSlots = async (req) => {
    try {
        const { agentId, date } = req.query;
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const selectedDate = new Date(date);
        const dayOfWeek = selectedDate.toLocaleString('en-us', { weekday: 'long' });
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

        // Get all bookings for this date
        const bookings = await Booking.find({
            agentId,
            date,
            status: 'confirmed'
        });

        // Generate available time slots based on settings and existing bookings
        const availableSlots = [];
        for (const timeSlot of daySettings.timeSlots) {
            let currentTime = timeSlot.startTime;
            while (currentTime < timeSlot.endTime) {
                const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                if (slotEnd > timeSlot.endTime) break;

                const isAvailable = await isTimeSlotAvailable(agentId, date, currentTime, slotEnd);
                if (isAvailable) {
                    availableSlots.push({
                        startTime: currentTime,
                        endTime: slotEnd
                    });
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


/**
 * Gets day-wise availability for the next 60 days
 * @param {Object} req - The request object containing agentId
 * @returns {Object} - Object with dates as keys and availability as boolean values
 */
export const getDayWiseAvailability = async (req) => {
    try {
        const { agentId } = req.query;

        if (!agentId) {
            return await errorMessage('Agent ID is required');
        }

        // Get agent's appointment settings
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage('Appointment settings not found');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const availabilityMap = {};
        const dayOfWeekMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Create a map of unavailable dates for faster lookup
        const unavailableDatesMap = {};
        if (settings.unavailableDates && settings.unavailableDates.length > 0) {
            settings.unavailableDates.forEach(unavailable => {
                const dateString = new Date(unavailable.date).toISOString().split('T')[0];
                
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
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 60);

        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: today.toLocaleDateString('en-CA'),
                $lte: endDate.toLocaleDateString('en-CA')
            },
            status: 'confirmed'
        });

        // Create a map of bookings by date for faster lookup
        const bookingsByDate = {};
        allBookings.forEach(booking => {
            if (!bookingsByDate[booking.date]) {
                bookingsByDate[booking.date] = [];
            }
            bookingsByDate[booking.date].push(booking);
        });

        // Loop through the next 60 days
        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);

            const dateString = currentDate.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const dayOfWeekString = dayOfWeekMap[dayOfWeek];

            // Check if the date has any all-day unavailability
            if (unavailableDatesMap[dateString] && 
                unavailableDatesMap[dateString].some(slot => slot.allDay)) {
                availabilityMap[dateString] = false;
                continue;
            }

            // Check if availability settings exist
            if (!settings.availability) {
                availabilityMap[dateString] = false;
                continue;
            }

            const daySettings = settings.availability.find(day => day.day === dayOfWeekString);

            // Check if the day is available in settings
            if (!daySettings || !daySettings.available || daySettings.timeSlots.length === 0) {
                availabilityMap[dateString] = false;
                continue;
            }

            // Check if there are any available time slots for this day
            let isAvailable = false;
            const dayBookings = bookingsByDate[dateString] || [];
            const dayUnavailability = unavailableDatesMap[dateString] || [];

            // Create a function to check time slot availability without database query
            const checkTimeSlotAvailability = (date, startTime, endTime) => {
                // Convert times to comparable format (minutes since midnight)
                const [startHours, startMinutes] = startTime.split(':').map(Number);
                const [endHours, endMinutes] = endTime.split(':').map(Number);

                const slotStartMinutes = startHours * 60 + startMinutes;
                const slotEndMinutes = endHours * 60 + endMinutes;

                // Check if any booking overlaps with this time slot
                const bookingOverlap = dayBookings.some(booking => {
                    const [bookingStartHour, bookingStartMin] = booking.startTime.split(':').map(Number);
                    const [bookingEndHour, bookingEndMin] = booking.endTime.split(':').map(Number);

                    const bookingStartTotal = bookingStartHour * 60 + bookingStartMin;
                    const bookingEndTotal = bookingEndHour * 60 + bookingEndMin;

                    // Check for overlap
                    return (
                        (slotStartMinutes < bookingEndTotal && slotEndMinutes > bookingStartTotal)
                    );
                });

                if (bookingOverlap) return false;

                // Check if any unavailable time slot overlaps with this time slot
                const unavailabilityOverlap = dayUnavailability.some(slot => {
                    if (slot.allDay) return true;
                    
                    const [unavailStartHour, unavailStartMin] = slot.startTime.split(':').map(Number);
                    const [unavailEndHour, unavailEndMin] = slot.endTime.split(':').map(Number);

                    const unavailStartTotal = unavailStartHour * 60 + unavailStartMin;
                    const unavailEndTotal = unavailEndHour * 60 + unavailEndMin;

                    // Check for overlap
                    return (
                        (slotStartMinutes < unavailEndTotal && slotEndMinutes > unavailStartTotal)
                    );
                });

                return !bookingOverlap && !unavailabilityOverlap;
            };

            // Check each time slot
            timeSlotLoop: for (const timeSlot of daySettings.timeSlots) {
                let currentTime = timeSlot.startTime;
                while (currentTime < timeSlot.endTime) {
                    const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                    if (slotEnd > timeSlot.endTime) break;

                    if (checkTimeSlotAvailability(dateString, currentTime, slotEnd)) {
                        isAvailable = true;
                        break timeSlotLoop;
                    }

                    currentTime = addMinutes(currentTime, settings.meetingDuration + settings.bufferTime);
                }
            }

            availabilityMap[dateString] = isAvailable;
        }

        return await successMessage(availabilityMap);
    } catch (error) {
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

        if (!unavailableDates || !Array.isArray(unavailableDates)) {
            return await errorMessage('Unavailable dates must be provided as an array');
        }

        // Find the existing appointment settings
        const settings = await AppointmentSettings.findOne({ agentId });

        if (!settings) {
            return await errorMessage('Appointment settings not found for this agent');
        }

        // Convert string dates to Date objects if needed
        const formattedDates = unavailableDates.map(date =>
            date instanceof Date ? date : new Date(date)
        );

        // Filter out invalid dates
        const validDates = formattedDates.filter(date => !isNaN(date.getTime()));

        if (validDates.length !== unavailableDates.length) {
            return await errorMessage('Some dates provided are invalid');
        }

        // Update the unavailable dates
        settings.unavailableDates = validDates;
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

