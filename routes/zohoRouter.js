import express from 'express';
import {
  configureZoho,
  startZohoOAuth,
  handleZohoCallback,
  getZohoItems
} from '../controllers/zohoController.js';

const router = express.Router();

// Step 1 - Configure Zoho credentials for an agent
router.post('/config', async (req, res) => {
  try {
    await configureZoho(req, res);
  } catch (error) {
    res.status(400).json({ error: true, result: error.message });
  }
});

// Step 2 - Start OAuth flow by redirecting to Zoho consent page
router.get('/auth', async (req, res) => {
  try {
    await startZohoOAuth(req, res);
  } catch (error) {
    res.status(400).json({ error: true, result: error.message });
  }
});

// Step 3 - Handle OAuth callback and exchange code for tokens
router.get('/callback', async (req, res) => {
  try {
    await handleZohoCallback(req, res);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(400).json({ error: true, result: error.message });
  }
});

// Step 4 - Fetch Zoho Inventory items
router.get('/items', async (req, res) => {
  try {
    await getZohoItems(req, res);
  } catch (error) {
    res.status(400).json({ error: true, result: error.message });
  }
});

export default router;