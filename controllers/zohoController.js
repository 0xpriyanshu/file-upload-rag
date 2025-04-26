// controllers/zohoController.js
import axios from 'axios';
import qs from 'qs';
import dotenv from 'dotenv';
import Service from '../models/Service.js';
import Agent from '../models/AgentModel.js';
dotenv.config();

// Save Zoho credentials for an agent
export const configureZoho = async (req, res) => {
  const { agentId, clientId, clientSecret, redirectUri, orgId } = req.body;
  if (!agentId || !clientId || !clientSecret || !redirectUri || !orgId) {
    return res.status(400).json({ error: true, result: 'Missing required fields' });
  }
  
  // Validate agent exists
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    return res.status(404).json({ error: true, result: 'Agent not found' });
  }
  
  try {
    // Create credentials as a regular object since Map will be created by Mongoose
    const credentials = {
      clientId, 
      clientSecret,
      redirectUri,
      orgId
    };
    
    // Upsert service record with clientId directly on the document
    let service = await Service.findOneAndUpdate(
      { agentId, serviceType: 'ZOHO_INVENTORY' },
      { 
        clientId, // This satisfies the required field in the schema
        credentials,
        isEnabled: true 
      },
      { upsert: true, new: true }
    );
    
    return res.json({ error: false, result: service });
  } catch (err) {
    console.error('Zoho config error:', err);
    return res.status(500).json({ error: true, result: err.message });
  }
};

// Redirect to Zoho OAuth consent screen
export const startZohoOAuth = async (req, res) => {
  const { agentId } = req.query;
  
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }
  
  // Get values from credentials Map
  const clientId = service.credentials.get('clientId');
  const redirectUri = service.credentials.get('redirectUri');
  
  if (!clientId || !redirectUri) {
    return res.status(400).json({ 
      error: true, 
      result: 'Missing Zoho credentials. Please reconfigure the integration.' 
    });
  }
  
  const url = `https://accounts.zoho.in/oauth/v2/auth?scope=ZohoInventory.items.READ&client_id=${clientId}&response_type=code&access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}&state=${agentId}`;
  
  res.redirect(url);
};

// Exchange code for tokens and persist
export const handleZohoCallback = async (req, res) => {
  const { code, state: agentId } = req.query;
  if (!code || !agentId) {
    return res.status(400).json({ error: true, result: 'Missing code or agentId' });
  }
  
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }
  
  // Access Map values
  const clientId = service.credentials.get('clientId');
  const clientSecret = service.credentials.get('clientSecret');
  const redirectUri = service.credentials.get('redirectUri');
  
  try {
    const tokenResp = await axios.post(
      'https://accounts.zoho.in/oauth/v2/token',
      qs.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const { access_token, refresh_token } = tokenResp.data;
    
    // Update service record with tokens
    service.credentials.set('accessToken', access_token);
    service.credentials.set('refreshToken', refresh_token);
    await service.save();
    
    return res.json({ error: false, result: 'OAuth successful! You can now access Zoho Inventory.' });
  } catch (err) {
    console.error('OAuth Callback Error:', err.response?.data || err.message);
    return res.status(500).json({ error: true, result: 'OAuth token exchange failed' });
  }
};

// Helper function to refresh Zoho tokens
const refreshZohoToken = async (service) => {
  try {
    const refreshToken = service.credentials.get('refreshToken');
    const clientId = service.credentials.get('clientId');
    const clientSecret = service.credentials.get('clientSecret');
    
    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error('Missing refresh credentials');
    }
    
    const response = await axios.post(
      'https://accounts.zoho.in/oauth/v2/token',
      qs.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    if (response.data && response.data.access_token) {
      // Update the access token in the database
      service.credentials.set('accessToken', response.data.access_token);
      
      // If Zoho also returns a new refresh token, update that too
      if (response.data.refresh_token) {
        service.credentials.set('refreshToken', response.data.refresh_token);
      }
      
      await service.save();
      return response.data.access_token;
    } else {
      throw new Error('Failed to refresh token');
    }
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    throw new Error('Failed to refresh Zoho token');
  }
};

// Helper function to fetch Zoho items
const fetchZohoItems = async (accessToken, orgId) => {
  return await axios.get('https://www.zohoapis.in/inventory/v1/items', {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Organization-Id': orgId
    }
  });
};

// Fetch inventory items using stored token
export const getZohoItems = async (req, res) => {
  const { agentId } = req.query;
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }
  
  let accessToken = service.credentials.get('accessToken');
  const orgId = service.credentials.get('orgId');
  
  if (!accessToken) {
    return res.status(400).json({ error: true, result: 'Access token not available. Please complete OAuth flow.' });
  }
  
  try {
    // First attempt with current token
    const response = await fetchZohoItems(accessToken, orgId);
    
    // Format the items in the required structure
    const formattedItems = response.data.items.map(item => ({
      _id: item.item_id,
      title: item.name,
      description: item.description || item.name,
      image: item.image_name || "https://shopify-gobbl-images-bucket.s3.ap-south-1.amazonaws.com/gobbl.jpg.jpeg",
      price: item.rate,
      about: item.description || item.name
    }));
    
    return res.json({
      error: false,
      data: formattedItems
    });
    
  } catch (err) {
    if (err.response && err.response.status === 401) {
      try {
        console.log('Token expired, attempting refresh...');
        const newAccessToken = await refreshZohoToken(service);
        
        const response = await fetchZohoItems(newAccessToken, orgId);
        
        const formattedItems = response.data.items.map(item => ({
          _id: item.item_id,
          title: item.name,
          description: item.description || item.name,
          image: item.image_name || "https://shopify-gobbl-images-bucket.s3.ap-south-1.amazonaws.com/gobbl.jpg.jpeg",
          price: item.rate,
          about: item.description || item.name
        }));
        
        return res.json({
          error: false,
          data: formattedItems
        });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ 
          error: true, 
          result: 'Failed to refresh Zoho token. Please re-authenticate.' 
        });
      }
    }
    
    console.error('Zoho API Error:', err.response?.data || err.message);
    return res.status(500).json({ 
      error: true, 
      result: err.response?.data?.message || 'Failed to fetch items from Zoho' 
    });
  }
};