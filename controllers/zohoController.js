// controllers/zohoController.js
import axios from 'axios';
import qs from 'qs';
import dotenv from 'dotenv';
import Service from '../models/Service.js';
import Agent from '../models/AgentModel.js';
dotenv.config();

export const configureZoho = async (req, res) => {
  const { agentId, clientId, clientSecret, redirectUri, orgId } = req.body;
  if (!agentId || !clientId || !clientSecret || !redirectUri || !orgId) {
    return res.status(400).json({ error: true, result: 'Missing required fields' });
  }
  
  const agent = await Agent.findOne({ agentId });
  if (!agent) {
    return res.status(404).json({ error: true, result: 'Agent not found' });
  }
  
  try { 
    let service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
    
    if (!service) {
      service = new Service({
        agentId,
        serviceType: 'ZOHO_INVENTORY',
        clientId, 
      clientId, 
        clientId, 
        credentials: new Map(), 
        isEnabled: true
      });
    }
    
    service.credentials.set('clientId', clientId);
    service.credentials.set('clientSecret', clientSecret);
    service.credentials.set('redirectUri', redirectUri);
    service.credentials.set('orgId', orgId);
    
    await service.save();
    
    return res.json({ error: false, result: service });
  } catch (err) {
    console.error('Zoho config error:', err);
    return res.status(500).json({ error: true, result: err.message });
  }
};

export const startZohoOAuth = async (req, res) => {
  const { agentId } = req.query;
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }

  const clientId = service.credentials.get('clientId');
  const redirectUri = service.credentials.get('redirectUri');

  if (!clientId || !redirectUri) {
    return res.status(400).json({ 
      error: true, 
      result: 'Missing Zoho credentials. Please reconfigure the integration.' 
    });
  }

  const url = `https://accounts.zoho.in/oauth/v2/auth?scope=ZohoInventory.items.READ,ZohoInventory.settings.READ&client_id=${clientId}&response_type=code&access_type=offline&prompt=consent&redirect_uri=${encodeURIComponent(redirectUri)}&state=${agentId}`;
  
  res.redirect(url);
};

export const handleZohoCallback = async (req, res) => {
  const { code, state: agentId } = req.query;
  if (!code || !agentId) {
    return res.status(400).json({ error: true, result: 'Missing code or agentId' });
  }
  
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }
  
  const clientId = service.credentials.get('clientId');
  const clientSecret = service.credentials.get('clientSecret');
  const redirectUri = service.credentials.get('redirectUri');
  
  try {
    console.log(`Starting token exchange for agent ${agentId}`);
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
    
    const { access_token, refresh_token, expires_in } = tokenResp.data;
    
    console.log('Token exchange successful:', {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
      agent: agentId
    });
    
    if (!refresh_token) {
      console.error('No refresh token received from Zoho. Make sure access_type=offline and prompt=consent are set in OAuth URL');
      return res.status(400).json({ error: true, result: 'No refresh token received. Please try again.' });
    }
    
    service.credentials.set('accessToken', access_token);
    service.credentials.set('refreshToken', refresh_token);
    service.credentials.set('tokenExpiresAt', new Date(Date.now() + (expires_in * 1000)).toISOString());
    await service.save();
    
    return res.json({ error: false, result: 'OAuth successful! You can now access Zoho Inventory.' });
  } catch (err) {
    console.error('OAuth Callback Error:', err.response?.data || err.message);
    return res.status(500).json({ error: true, result: 'OAuth token exchange failed' });
  }
};

const refreshZohoToken = async (service) => {
  try {
    const refreshToken = service.credentials.get('refreshToken');
    const clientId = service.credentials.get('clientId');
    const clientSecret = service.credentials.get('clientSecret');
    const redirectUri = service.credentials.get('redirectUri');
    
    console.log('Refresh token details:', {
      hasRefreshToken: !!refreshToken,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRedirectUri: !!redirectUri,
      agentId: service.agentId
    });
    
    if (!refreshToken) {
      console.error('No refresh token available for agent:', service.agentId);
      throw new Error('No refresh token available. Please re-authenticate.');
    }
    
    if (!clientId || !clientSecret) {
      throw new Error('Missing refresh credentials');
    }
    
    console.log('Attempting to refresh token for agent:', service.agentId);
    
    const response = await axios.post(
      'https://accounts.zoho.in/oauth/v2/token',
      qs.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'refresh_token'
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    console.log('Token refresh response stats:', {
      status: response.status,
      hasAccessToken: !!response.data?.access_token,
      expiresIn: response.data?.expires_in,
      hasRefreshToken: !!response.data?.refresh_token
    });
    
    if (response.data && response.data.access_token) {
      service.credentials.set('accessToken', response.data.access_token);
      
      if (response.data.refresh_token) {
        console.log('Got new refresh token, updating');
        service.credentials.set('refreshToken', response.data.refresh_token);
      }
      
      const expiresIn = response.data.expires_in || 3600;
      service.credentials.set('tokenExpiresAt', new Date(Date.now() + (expiresIn * 1000)).toISOString());
      
      await service.save();
      console.log('Token refreshed successfully for agent:', service.agentId);
      return response.data.access_token;
    } else {
      throw new Error('Failed to refresh token: No access_token in response');
    }
  } catch (error) {
    if (error.response) {
      console.error('Token refresh API error:', {
        status: error.response.status,
        data: error.response.data
      });
      
      if (error.response.status === 400) {
        throw new Error('Refresh token is invalid or expired. Please re-authenticate.');
      }
    } else {
      console.error('Token refresh error:', error.message);
    }
    throw error;
  }
};

const checkAndRefreshToken = async (service) => {
  const accessToken = service.credentials.get('accessToken');
  const tokenExpiresAt = service.credentials.get('tokenExpiresAt');
  
  console.log('Current token status:', {
    hasAccessToken: !!accessToken,
    expiresAt: tokenExpiresAt ? new Date(tokenExpiresAt) : 'not set',
    now: new Date(),
    agentId: service.agentId
  });
  
  if (!tokenExpiresAt || !accessToken) {
    console.log('No token or expiration found, attempting refresh');
    return await refreshZohoToken(service);
  }
  
  const expiresAt = new Date(tokenExpiresAt);
  const now = new Date();
  
  const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
  
  if (expiresAt <= tenMinutesFromNow) {
    console.log('Token expired or expiring soon, refreshing');
    return await refreshZohoToken(service);
  }
  
  console.log('Using existing valid token');
  return accessToken;
};

export const getZohoItems = async (req, res) => {
  const { agentId } = req.query;
  const service = await Service.findOne({ agentId, serviceType: 'ZOHO_INVENTORY' });
  
  if (!service) {
    return res.status(400).json({ error: true, result: 'Zoho not configured for this agent' });
  }
  
  try {
    const accessToken = await checkAndRefreshToken(service);
    const orgId = service.credentials.get('orgId');
    
    if (!orgId) {
      return res.status(400).json({ error: true, result: 'Organization ID not configured' });
    }
    
    console.log(`Making Zoho API request for agent ${agentId} with valid token`);
    
    const response = await axios.get('https://www.zohoapis.in/inventory/v1/items', {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Organization-Id': orgId
      }
    });
    
    console.log(`Received ${response.data?.items?.length || 0} items from Zoho API`);
    const formattedItems = response.data.items.map(item => ({
      _id: item.item_id,
      title: item.name,
      description: item.description || item.name,
      image: "",
      price: item.rate,
      about: item.description || item.name,
      stock: item.actual_available_stock
    }));
    
    return res.json({
      error: false,
      result: formattedItems  
    });
    
  } catch (err) {
    if (err.message === 'No refresh token available. Please re-authenticate.' || 
        err.message === 'Refresh token is invalid or expired. Please re-authenticate.') {
      return res.status(401).json({ 
        error: true, 
        result: 'Authentication expired. Please re-authenticate with Zoho.' 
      });
    }
    
    if (err.response?.data) {
      console.error('Zoho API Error:', {
        status: err.response.status,
        data: err.response.data
      });
    } else {
      console.error('Zoho API Error:', err.message);
    }
    
    return res.status(500).json({ 
      error: true, 
      result: err.response?.data?.message || 'Failed to fetch items from Zoho' 
    });
  }
};