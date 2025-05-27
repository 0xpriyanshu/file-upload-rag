import express from 'express';
import {
    saveAppointmentSettings,
    bookAppointment,
    getAppointmentBookings,
    cancelBooking,
    getAvailableTimeSlots,
    getAppointmentSettings,
    updateUnavailableDates,
    getDayWiseAvailability,
    getUserBookingHistory,
    userRescheduleBooking,
    getBookingForReschedule,
    sendRescheduleRequestEmailToUser,
    initializeRemindersForExistingBookings
} from '../controllers/appointmentController.js';

const router = express.Router();

router.post('/settings', async (req, res) => {
    try {
        const response = await saveAppointmentSettings(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.get('/settings', async (req, res) => {
    try {
        const response = await getAppointmentSettings(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/book', async (req, res) => {
    try {
        const response = await bookAppointment(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.get('/bookings', async (req, res) => {
    try {
        const response = await getAppointmentBookings(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.get('/user-bookings', async (req, res) => {
    try {
        const response = await getUserBookingHistory(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/cancel-booking', async (req, res) => {
    try {
      const response = await cancelBooking(req);
      res.status(200).json(response);
    } catch (error) {
      res.status(400).json({ error: true, result: error.message });
    }
});       

router.get('/available-slots', async (req, res) => {
    try {
        const response = await getAvailableTimeSlots(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.get('/day-wise-availability', async (req, res) => {
    try {
        const response = await getDayWiseAvailability(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/update-unavailable-dates', async (req, res) => {
    try {
        const response = await updateUnavailableDates(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/user-reschedule', async (req, res) => {
    try {
        const response = await userRescheduleBooking(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.get('/booking-for-reschedule', async (req, res) => {
    try {
        const response = await getBookingForReschedule(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/send-reschedule-email', async (req, res) => {
    try {
        const response = await sendRescheduleRequestEmailToUser(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, result: error.message });
    }
});

router.post('/initialize-reminders', async (req, res) => {
    try {
        await initializeRemindersForExistingBookings();
        res.json({ 
            success: true, 
            message: 'Reminders initialized for existing bookings',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error initializing reminders:', error);
        res.status(500).json({ 
            error: 'Initialization failed',
            message: error.message 
        });
    }
});

export default router;