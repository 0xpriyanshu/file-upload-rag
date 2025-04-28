import express from 'express';
import {
  configureZoho,
  startZohoOAuth,
  handleZohoCallback,
  getZohoItems
} from '../controllers/zohoController.js';

const router = express.Router();

router.post('/config', async (req, res) => {
  try {
    await configureZoho(req, res);
  } catch (error) {
    console.error('Zoho config route error:', error);
    res.status(500).json({ error: true, result: error.message });
  }
});

router.get('/auth', async (req, res) => {
  try {
    await startZohoOAuth(req, res);
  } catch (error) {
    console.error('Zoho auth route error:', error);
    res.status(500).json({ error: true, result: error.message });
  }
});

router.get('/callback', async (req, res) => {
  try {
    await handleZohoCallback(req, res);
  } catch (error) {
    console.error('OAuth Callback route error:', error);
    res.status(500).json({ error: true, result: error.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    await getZohoItems(req, res);
  } catch (error) {
    console.error('Zoho items route error:', error);
    res.status(500).json({ error: true, result: error.message });
  }
});

export default router;