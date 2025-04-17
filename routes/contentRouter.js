import express from 'express';
import { extractContent, testYoutubeTranscript, googleAuth, googleAuthCallback, debugEnvironment} from '../controllers/contentController.js';

const router = express.Router();

router.post('/extract', extractContent);

router.get('/test-youtube-transcript/:videoId', testYoutubeTranscript);

router.get('/auth/google', googleAuth);
router.get('/auth/google/callback', googleAuthCallback);
router.get('/debug-env', debugEnvironment);

router.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    youtube: {
      apiKey: Boolean(process.env.YOUTUBE_API_KEY),
      oauth: Boolean(process.env.GOOGLE_ACCESS_TOKEN && process.env.GOOGLE_REFRESH_TOKEN)
    },
    version: '1.2.0'
  });
});

export default router;