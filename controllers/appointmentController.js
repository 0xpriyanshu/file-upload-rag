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