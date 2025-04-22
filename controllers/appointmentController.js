import AppointmentSettings from "../models/AppointmentSettingsModel.js";
import Booking from "../models/BookingModel.js";
import { errorMessage, successMessage } from "./clientController.js";



// Helper function to check if a time slot is available
const isTimeSlotAvailable = async (agentId, date, startTime, endTime) => {
    // Get all bookings for this time slot
    const existingBookings = await Booking.find({
        agentId,
        date,
        status: 'confirmed',
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
    const dayOfWeek = new Date(date).toLocaleString('en-us', { weekday: 'long' });

    // Check if day is available
    const daySettings = settings.availability.find(a => a.day === dayOfWeek);
    if (!daySettings || !daySettings.available) return false;

    // Check if time is within available slots
    const isWithinTimeSlots = daySettings.timeSlots.some(slot => {
        return startTime >= slot.startTime && endTime <= slot.endTime;
    });

    // Check if time overlaps with lunch break
    const isLunchTime = startTime >= settings.lunchBreak.start && endTime <= settings.lunchBreak.end;

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

        // If it's a virtual meeting, generate a meeting link
        if (location === 'google_meet') {
            // Integrate with Google Calendar API to create meeting
            // booking.meetingLink = await createGoogleMeet();
            booking.meetingLink = `https://meet.google.com/${Math.random().toString(36).substring(7)}`;
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

        const dayOfWeek = new Date(date).toLocaleString('en-us', { weekday: 'long' });
        const daySettings = settings.availability.find(a => a.day === dayOfWeek);

        if (!daySettings || !daySettings.available) {
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
        
        // Loop through the next 60 days
        for (let i = 0; i < 60; i++) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);
            
            const dateString = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
            
            // Check if the date is in unavailable dates
            const isUnavailableDate = settings.unavailableDates && 
                settings.unavailableDates.some(unavailableDate => 
                    new Date(unavailableDate).toISOString().split('T')[0] === dateString
                );
            
            if (isUnavailableDate) {
                availabilityMap[dateString] = false;
                continue;
            }
            
            // Get day settings from the appointment settings
            const daySettings = settings.weeklySchedule.find(day => day.dayOfWeek === dayOfWeek);
            
            // Check if the day is available in settings
            let isAvailable = false;
            if (daySettings && daySettings.available && daySettings.timeSlots.length > 0) {
                // Check if there are any available time slots for this day
                const formattedDate = dateString;
                const dayBookings = await Booking.find({
                    agentId,
                    date: formattedDate,
                    status: 'confirmed'
                });
                
                // If the day has time slots and not fully booked, mark as available
                for (const timeSlot of daySettings.timeSlots) {
                    let currentTime = timeSlot.startTime;
                    while (currentTime < timeSlot.endTime) {
                        const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                        if (slotEnd > timeSlot.endTime) break;
                        
                        const slotAvailable = await isTimeSlotAvailable(agentId, formattedDate, currentTime, slotEnd);
                        if (slotAvailable) {
                            isAvailable = true;
                            break;
                        }
                        currentTime = addMinutes(currentTime, settings.meetingDuration + settings.bufferTime);
                    }
                    
                    if (isAvailable) break;
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

