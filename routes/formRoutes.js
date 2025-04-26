// routes/formRoutes.js
import express from 'express';
import { 
    createFormConfig, 
    updateFormConfig, 
    getFormConfig, 
    deleteFormConfig 
} from '../controllers/formController.js';

const router = express.Router();

router.post('/create-form', async (req, res) => {
    try {
        const response = await createFormConfig(req);
        res.status(response.error ? 400 : 200).send(response);
    } catch (error) {
        res.status(500).send({
            error: true,
            result: error.message
        });
    }
});

router.put('/update-form/:agentId', async (req, res) => {
    try {
        const response = await updateFormConfig(req);
        res.status(response.error ? 400 : 200).send(response);
    } catch (error) {
        res.status(500).send({
            error: true,
            result: error.message
        });
    }
});

router.get('/get-form/:agentId', async (req, res) => {
    try {
        const response = await getFormConfig(req);
        res.status(response.error ? 404 : 200).send(response);
    } catch (error) {
        res.status(500).send({
            error: true,
            result: error.message
        });
    }
});

router.delete('/delete-form/:agentId', async (req, res) => {
    try {
        const response = await deleteFormConfig(req);
        res.status(response.error ? 404 : 200).send(response);
    } catch (error) {
        res.status(500).send({
            error: true,
            result: error.message
        });
    }
});

export default router;