// routes/formRoutes.js
import express from 'express';
import { 
   getEmailTemplates,
   updateEmailTemplates
} from '../controllers/emailController.js';

const router = express.Router();

router.get('/getEmailTemplates', async (req, res) => {
    try {
        const { agentId } = req.query;
        const response = await getEmailTemplates(agentId);
        return res.status(200).send(response);
    } catch (error) {
        res.status(400).json(error);
    }
});

router.post('/updateEmailTemplates', async (req, res) => {
    try {
        const response = await updateEmailTemplates(req.body);
        return res.status(200).send(response);
    } catch (error) {
        res.status(400).json(error);
    }
});


export default router;