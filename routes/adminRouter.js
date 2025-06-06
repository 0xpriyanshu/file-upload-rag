import express from 'express';
import {
    getAdminChatLogs,
    updateChatLog,
    getUserChatLogs
} from '../controllers/adminController.js';

const router = express.Router();

router.get('/getAdminChatLogs', async (req, res) => {
    try {
        const response = await getAdminChatLogs();
        res.status(200).send(response);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.post('/updateChatLog', async (req, res) => {
    try {
        const response = await updateChatLog(req.body.newUserLog, req.body.clientId);
        res.status(200).send(response);
    } catch (error) {
        res.status(400).send(error);
    }
});

router.get('/getAdminSupportLogs', async (req, res) => {
    try {
        const response = await getUserChatLogs(req.query.clientId);
        res.status(200).send(response);
    } catch (error) {
        res.status(400).send(error);
    }
});


export default router;