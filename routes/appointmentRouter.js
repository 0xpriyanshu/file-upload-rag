import express from 'express';
import {
    saveAppointmentSettings,
    bookAppointment,
    getAvailableTimeSlots
} from '../controllers/appointmentController.js';

const router = express.Router();

router.post('/settings', async (req, res) => {
    try {
        const response = await saveAppointmentSettings(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.post('/book', async (req, res) => {
    try {
        const response = await bookAppointment(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

router.get('/available-slots', async (req, res) => {
    try {
        const response = await getAvailableTimeSlots(req);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: true, message: error.message });
    }
});

export default router; 