import { google } from 'googleapis';
import { 
  extractYoutubeVideoId, 
  getYouTubeContent, 
  getYouTubeTranscriptEnhanced, 
  getBlogContent 
} from '../utils/contentExtractor.js';

const OAuth2 = google.auth.OAuth2;
const oauth2Client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

if (process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    access_token: process.env.GOOGLE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
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
    

    if (/youtube\.com|youtu\.be/.test(url)) {
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
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.force-ssl', 'https://www.googleapis.com/auth/youtubepartner'],
    prompt: 'consent'
  });
  res.redirect(authUrl);
};

/**
 * OAuth callback handler
 */
export const googleAuthCallback = async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    

    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);
    

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
    console.error('Error during authentication:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
};