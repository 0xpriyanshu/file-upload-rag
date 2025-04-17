import { google } from 'googleapis';
import {
  extractYoutubeVideoId,
  getYouTubeContent,
  getYouTubeTranscriptEnhanced,
  getBlogContent
} from '../utils/contentExtractor.js';

// Create the OAuth2 client with proper error checking
const createOAuth2Client = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  
  // Debug logging - don't include actual values for security
  console.log('OAuth setup - Client ID exists:', Boolean(clientId));
  console.log('OAuth setup - Client Secret exists:', Boolean(clientSecret));
  console.log('OAuth setup - Redirect URI:', redirectUri);
  
  if (!clientId || !clientSecret || !redirectUri) {
    console.error('Missing OAuth credentials. Check your .env file for GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI');
    return null;
  }
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

// Initialize the OAuth2 client safely
const oauth2Client = createOAuth2Client();

// Configure YouTube API with API key for basic operations
let youtube = null;
if (process.env.YOUTUBE_API_KEY) {
  youtube = google.youtube({
    version: 'v3',
    auth: process.env.YOUTUBE_API_KEY
  });
}

/**
 * Main endpoint for extracting content from URLs
 */
export const extractContent = async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Determine the type of URL and extract content accordingly
    if (/youtube\.com|youtu\.be/.test(url)) {
      // Check if YouTube API is configured
      if (!youtube) {
        return res.status(503).json({ 
          error: 'YouTube API not configured', 
          message: 'Please add YOUTUBE_API_KEY to your environment variables.' 
        });
      }
      
      const videoId = extractYoutubeVideoId(url);
      if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL' });
      }
      
      const content = await getYouTubeContent(videoId);
      return res.json({ 
        success: true, 
        content: content.fullText, 
        platform: 'youtube',
        source: content.source
      });
    }
    
    // For all other URLs, assume it's a blog/article
    const content = await getBlogContent(url);
    return res.json({ success: true, content: content.fullText, platform: 'blog' });
    
  } catch (error) {
    console.error('Error processing URL:', error);
    return res.status(500).json({ error: error.message || 'Failed to extract content' });
  }
};

/**
 * Test YouTube transcript extraction endpoint
 */
export const testYoutubeTranscript = async (req, res) => {
  try {
    const { videoId } = req.params;
    
    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    // Try the enhanced scraper
    console.log(`Testing transcript extraction for video ${videoId}...`);
    const result = await getYouTubeTranscriptEnhanced(videoId);
    
    if (result.transcript) {
      return res.json({
        success: true,
        method: result.method,
        sample: result.transcript.substring(0, 200) + '...',
        wordCount: result.transcript.split(' ').length
      });
    } else {
      return res.json({
        success: false,
        message: 'Failed to extract transcript using any method'
      });
    }
  } catch (error) {
    console.error('Error testing transcript extraction:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * OAuth authentication endpoint for YouTube
 */
export const googleAuth = (req, res) => {
  // Check if OAuth client is properly configured
  if (!oauth2Client) {
    return res.status(500).send(`
      <h1>OAuth Configuration Error</h1>
      <p>Google OAuth is not properly configured. Check server logs for details.</p>
      <p>Make sure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set in your .env file.</p>
    `);
  }
  
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/youtubepartner'],
      prompt: 'consent' // Force to get refresh token
    });
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).send(`
      <h1>Authentication Error</h1>
      <p>Error: ${error.message}</p>
      <p>Please check your OAuth configuration.</p>
    `);
  }
};

/**
 * OAuth callback handler
 */
export const googleAuthCallback = async (req, res) => {
  // Check if OAuth client is properly configured
  if (!oauth2Client) {
    return res.status(500).send(`
      <h1>OAuth Configuration Error</h1>
      <p>Google OAuth is not properly configured. Check server logs for details.</p>
      <p>Make sure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are set in your .env file.</p>
    `);
  }
  
  const { code } = req.query;
  if (!code) {
    return res.status(400).send(`
      <h1>Missing Authorization Code</h1>
      <p>No authorization code was received from Google.</p>
      <p>Please try the authentication process again.</p>
    `);
  }
  
  try {
    console.log('Attempting to get token with code:', code ? 'Code exists' : 'No code provided');
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('Access Token received:', Boolean(tokens.access_token));
    console.log('Refresh Token received:', Boolean(tokens.refresh_token));
    
    // Set credentials for this session
    oauth2Client.setCredentials(tokens);
    
    res.send(`
      <h1>Authentication successful!</h1>
      <p>You can now close this window and use your application to extract YouTube captions.</p>
      <p>Please add these tokens to your .env file:</p>
      <pre>
GOOGLE_ACCESS_TOKEN=${tokens.access_token}
GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}
      </pre>
    `);
  } catch (error) {
    console.error('Detailed OAuth error:', error);
    res.status(500).send(`
      <h1>Authentication failed</h1>
      <p>Error: ${error.message}</p>
      <p>Please check that your Google credentials are correct and that the redirect URI matches exactly what's configured in Google Cloud Console.</p>
      <p>Make sure you've also enabled the YouTube Data API v3 in your Google Cloud Console project.</p>
    `);
  }
};

/**
 * Debug endpoint to check environment variables
 */
export const debugEnvironment = (req, res) => {
  res.json({
    clientIdExists: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecretExists: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    redirectUriExists: Boolean(process.env.GOOGLE_REDIRECT_URI),
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    youtubeApiKeyExists: Boolean(process.env.YOUTUBE_API_KEY),
    accessTokenExists: Boolean(process.env.GOOGLE_ACCESS_TOKEN),
    refreshTokenExists: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
    oauthClientInitialized: Boolean(oauth2Client),
    youtubeApiInitialized: Boolean(youtube)
  });
};