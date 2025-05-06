import AppointmentSettings from "../models/AppointmentSettingsModel.js";
import Booking from "../models/BookingModel.js";
import { errorMessage, successMessage } from "./clientController.js";
import { convertTime, formatDateToAPI, parseDateString } from "../utils/timezoneUtils.js";

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
        const { agentId, userId, date, startTime, endTime, location, userTimezone, name, phone, notes } = req.body;

        // Get agent settings to get the business timezone
        const settings = await AppointmentSettings.findOne({ agentId });
        if (!settings) {
            return await errorMessage("No appointment settings found for this agent");
        }

        const businessTimezone = settings.timezone || 'UTC';
        
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

        // Import necessary utilities
        const { 
            createGoogleMeetEvent, 
            createZoomMeeting, 
            createTeamsMeeting, 
            sendBookingConfirmationEmail, 
            getAdminEmailByAgentId,
            createGoogleMeetEventAsAdmin
        } = await import('../utils/emailUtils.js');
        
        const adminEmail = await getAdminEmailByAgentId(agentId);
        console.log('Admin email fetched:', adminEmail); 
        let meetingLink = null;

        if (location === 'google_meet') {
            try {
                const userEmailToUse = userId && userId.trim() !== '' ? userId : null;
                const adminEmailToUse = adminEmail && adminEmail.trim() !== '' ? adminEmail : null;
                
                console.log('Creating Google Meet with emails:', { userEmail: userEmailToUse, adminEmail: adminEmailToUse });
                
                meetingLink = await createGoogleMeetEventAsAdmin({
                    date: bookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `Meeting with ${name || userId}`,
                    notes: notes || 'Appointment booking',
                    userEmail: userEmailToUse,
                    adminEmail: adminEmailToUse,
                    name: name
                });
            } catch (meetError) {
                console.error('Error creating Google Meet event:', meetError);
                return await errorMessage('Failed to create Google Meet event. Please try again.');
            }
        } else if (location === 'zoom') {
            try {
                meetingLink = await createZoomMeeting({
                    date: bookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `Meeting with ${name || userId}`,
                    notes: notes || 'Appointment booking'
                });
            } catch (zoomError) {
                console.error('Error creating Zoom meeting:', zoomError);
                return await errorMessage('Failed to create Zoom meeting. Please try again.');
            }
        } else if (location === 'teams') {
            try {
                meetingLink = await createTeamsMeeting({
                    date: bookingDate,
                    startTime,
                    endTime,
                    userTimezone: userTimezone || businessTimezone,
                    summary: `Meeting with ${name || userId}`,
                    notes: notes || 'Appointment booking'
                });
            } catch (teamsError) {
                console.error('Error creating Teams meeting:', teamsError);
                return await errorMessage('Failed to create Teams meeting. Please try again.');
            }
        }

        // Create the booking
        const booking = new Booking({
            agentId,
            userId,
            date: bookingDate,
            startTime: businessStartTime,
            endTime: businessEndTime,
            location,
            userTimezone: userTimezone || businessTimezone,
            status: 'confirmed',
            notes,
            meetingLink
        });

        await booking.save();
        
        try {
            console.log('Preparing to send emails to:', { 
                user: userId, 
                admin: adminEmail, 
                meetingLink: booking.meetingLink 
            });
            
            const emailData = {
                email: userId,
                adminEmail: adminEmail,
                name: name || userId.split('@')[0], 
                date: bookingDate,
                startTime: startTime,
                endTime: endTime,
                location: location,
                meetingLink: booking.meetingLink,
                userTimezone: userTimezone || businessTimezone,
                notes: notes
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

        // Get all bookings for this date
        const bookings = await Booking.find({
            agentId,
            date: selectedDate,
            status: 'confirmed'
        });

        // Generate available time slots based on settings and existing bookings
        const availableSlots = [];
        for (const timeSlot of daySettings.timeSlots) {
            let currentTime = timeSlot.startTime;
            while (currentTime < timeSlot.endTime) {
                const slotEnd = addMinutes(currentTime, settings.meetingDuration);
                if (slotEnd > timeSlot.endTime) break;

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
  
      // Find the booking first to get its details
      const booking = await Booking.findById(bookingId);
      
      if (!booking) {
        return await errorMessage("Booking not found");
      }
      
      // Update the booking status
      booking.status = 'cancelled';
      booking.updatedAt = new Date();
      await booking.save();
      
      // Send cancellation email
      try {
        // Import email utility
        const { sendBookingCancellationEmail, getAdminEmailByAgentId } = await import('../utils/emailUtils.js');
        
        // Get admin email
        const adminEmail = await getAdminEmailByAgentId(booking.agentId);
        
        // Get user email from userId (assuming userId is email)
        const email = booking.userId;
        const name = email.split('@')[0]; // Extract name from email if needed
        
        // Prepare data for email
        const emailData = {
          email: email,
          adminEmail: adminEmail,
          name: name,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
          userTimezone: booking.userTimezone
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
        
        // Get today's date in the business timezone
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const availabilityMap = {};
        const dayOfWeekMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 60);

        const allBookings = await Booking.find({
            agentId,
            date: {
                $gte: today,
                $lte: endDate
            },
            status: 'confirmed'
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
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() + i);
            
            // Format date string for the map
            const dateString = currentDate.toISOString().split('T')[0];
            
            // Get day of week using the business timezone
            const options = { weekday: 'long', timeZone: businessTimezone };
            const dayOfWeekString = currentDate.toLocaleString('en-US', options);

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
