import axios from 'axios';
import cheerio from 'cheerio';
import { google } from 'googleapis';


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


const youtubeOAuth = google.youtube({
  version: 'v3',
  auth: oauth2Client
});


const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

/**
 * Helper function to extract YouTube video ID from a URL
 */
export function extractYoutubeVideoId(url) {
  const regex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})(?:\S*)?$/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Process SRT format to plain text
 */
export function processSrtToText(srtContent) {
  
  return srtContent
    .replace(/\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\r?\n/g, '')
    .replace(/\r?\n\r?\n\d+\r?\n/g, ' ') 
    .replace(/\r\n|\n\r|\r|\n/g, ' ') 
    .replace(/\s+/g, ' ') 
    .trim();
}

/**
 * Enhanced YouTube transcript scraper that uses multiple fallback methods
 */
export async function getYouTubeTranscriptEnhanced(videoId) {
  
  async function directScrape() {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Cache-Control': 'max-age=0',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-User': '?1',
          'Sec-Fetch-Dest': 'document',
          'Cookie': 'CONSENT=YES+cb; YSC=DwKYl4-q47Y; VISITOR_INFO1_LIVE=E9bCzXyrFZw;'
        }
      });
      
      const html = response.data;
      
      
      if (html.includes('"captionTracks":')) {
        
        const match = html.match(/"captionTracks":(\[.*?\])(?:,|});/);
        if (match && match[1]) {
          
          const captionTracks = JSON.parse(match[1]);
          
          
          const englishTrack = captionTracks.find(track => 
            track.languageCode === 'en' || track.name.simpleText === 'English'
          ) || captionTracks[0];
          
          if (englishTrack && englishTrack.baseUrl) {
            
            const captionResponse = await axios.get(englishTrack.baseUrl);
            if (captionResponse.data) {
              
              const $ = cheerio.load(captionResponse.data, { xmlMode: true });
              const texts = $('text').map((i, el) => $(el).text().trim()).get();
              
              if (texts.length > 0) {
                return texts.join(' ').replace(/\s+/g, ' ').trim();
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in direct scrape method:', error.message);
      return null;
    }
  }
  
  
  async function robustScrape() {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      
      const html = response.data;
      
      
      function extractJSON(html, pattern) {
        const regex = new RegExp(pattern);
        const match = regex.exec(html);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1]);
          } catch (e) {
            return null;
          }
        }
        return null;
      }
      
      
      const patterns = [
        'ytInitialPlayerResponse\\s*=\\s*({.*?});',
        'var\\s+ytInitialPlayerResponse\\s*=\\s*({.*?});',
        'window\\["ytInitialPlayerResponse"\\]\\s*=\\s*({.*?});'
      ];
      
      let playerResponse = null;
      for (const pattern of patterns) {
        playerResponse = extractJSON(html, pattern);
        if (playerResponse) break;
      }
      
      if (playerResponse && playerResponse.captions && 
          playerResponse.captions.playerCaptionsTracklistRenderer &&
          playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks) {
        
        const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        
        
        const englishTrack = captionTracks.find(track => 
          track.languageCode === 'en' || (track.name && track.name.simpleText === 'English')
        ) || captionTracks[0];
        
        if (englishTrack && englishTrack.baseUrl) {
          
          const captionResponse = await axios.get(englishTrack.baseUrl);
          if (captionResponse.data) {
            
            const $ = cheerio.load(captionResponse.data, { xmlMode: true });
            const texts = $('text').map((i, el) => $(el).text().trim()).get();
            
            if (texts.length > 0) {
              return texts.join(' ').replace(/\s+/g, ' ').trim();
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in robust scrape method:', error.message);
      return null;
    }
  }
  
  
  async function pytubeStyleScrape() {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });
      
      const html = response.data;
      
      
      const regexp = /"captionTracks":(\[.*?\])/;
      const match = regexp.exec(html);
      
      if (match && match[1]) {
        let captionTracks;
        try {
          captionTracks = JSON.parse(match[1]);
        } catch (e) {
          
          const fixedJson = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          captionTracks = JSON.parse(fixedJson);
        }
        
        if (Array.isArray(captionTracks) && captionTracks.length > 0) {
          
          const englishTrack = captionTracks.find(track => 
            track.languageCode === 'en' || 
            (track.name && (track.name.simpleText === 'English' || track.name.includes('English')))
          ) || captionTracks[0];
          
          if (englishTrack && englishTrack.baseUrl) {
            
            const cleanUrl = englishTrack.baseUrl
              .replace(/\\u0026/g, '&')
              .replace(/\\u003d/g, '=');
            
            
            const captionResponse = await axios.get(cleanUrl);
            if (captionResponse.data) {
              const $ = cheerio.load(captionResponse.data, { xmlMode: true });
              const texts = $('text').map((i, el) => $(el).text().trim()).get();
              
              if (texts.length > 0) {
                return texts.join(' ').replace(/\s+/g, ' ').trim();
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in pytube-style scrape method:', error.message);
      return null;
    }
  }
  
  
  async function autoGeneratedCaptionScrape() {
    try {
      
      const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      
      const html = response.data;
      
      
      if (html.includes('"captionTracks":')) {
        const match = html.match(/"captionTracks":(\[.*?\])(?:,|});/);
        if (match && match[1]) {
          const captionTracks = JSON.parse(match[1]);
          
          
          const autoTrack = captionTracks.find(track => 
            track.kind === 'asr' || 
            (track.name && track.name.simpleText && track.name.simpleText.includes('auto'))
          );
          
          if (autoTrack && autoTrack.baseUrl) {
            const captionResponse = await axios.get(autoTrack.baseUrl);
            if (captionResponse.data) {
              const $ = cheerio.load(captionResponse.data, { xmlMode: true });
              const texts = $('text').map((i, el) => $(el).text().trim()).get();
              
              if (texts.length > 0) {
                return texts.join(' ').replace(/\s+/g, ' ').trim();
              }
            }
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error in auto-generated caption scrape method:', error.message);
      return null;
    }
  }
  
  
  console.log(`Trying to extract transcript for video ${videoId}...`);
  
  
  console.log("Trying direct scrape method...");
  let transcript = await directScrape();
  if (transcript) {
    console.log("✓ Direct scrape method succeeded");
    return { transcript, method: 'Direct Scrape' };
  }
  
  
  console.log("Trying robust scrape method...");
  transcript = await robustScrape();
  if (transcript) {
    console.log("✓ Robust scrape method succeeded");
    return { transcript, method: 'Robust Scrape' };
  }
  
  
  console.log("Trying pytube-style scrape method...");
  transcript = await pytubeStyleScrape();
  if (transcript) {
    console.log("✓ Pytube-style scrape method succeeded");
    return { transcript, method: 'Pytube-Style Scrape' };
  }
  
  
  console.log("Trying auto-generated caption scrape method...");
  transcript = await autoGeneratedCaptionScrape();
  if (transcript) {
    console.log("✓ Auto-generated caption scrape method succeeded");
    return { transcript, method: 'Auto-Generated Captions' };
  }
  
  console.log("✗ All transcript extraction methods failed");
  return { transcript: null, method: 'Failed' };
}

/**
 * Enhanced function to extract YouTube content with all available fallback methods
 */
export async function getYouTubeContent(videoId) {
  try {
    
    const videoResponse = await youtube.videos.list({
      part: 'snippet',
      id: videoId
    });
    
    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      throw new Error('Video not found');
    }
    
    const videoDetails = videoResponse.data.items[0].snippet;
    let captionContent = "";
    let transcriptSource = "No transcript available";
    
    
    try {
      console.log(`Attempting to extract transcript for video ${videoId} using enhanced scraper...`);
      const result = await getYouTubeTranscriptEnhanced(videoId);
      
      if (result.transcript) {
        captionContent = result.transcript;
        transcriptSource = `Enhanced Scraper (${result.method})`;
        console.log(`✓ Successfully extracted transcript using ${result.method}`);
      } else {
        console.log("✗ Enhanced scraper failed to extract transcript");
      }
    } catch (enhancedError) {
      console.error('Error with enhanced transcript scraper:', enhancedError);
      
    }
    
    
    if (!captionContent && process.env.GOOGLE_ACCESS_TOKEN) {
      try {
        console.log("Trying official YouTube API method as backup...");
        const captionResponse = await youtube.captions.list({
          part: 'snippet',
          videoId: videoId
        });
        
        if (captionResponse.data.items && captionResponse.data.items.length > 0) {
          console.log(`Video has ${captionResponse.data.items.length} caption tracks available via the API`);
          const englishCaption = captionResponse.data.items.find(
            caption => caption.snippet.language === 'en'
          ) || captionResponse.data.items[0];
          
          try {
            const captionDownloadResponse = await youtubeOAuth.captions.download({
              id: englishCaption.id,
              tfmt: 'srt'
            }, {
              responseType: 'text'
            });
            
            if (captionDownloadResponse.data) {
              captionContent = processSrtToText(captionDownloadResponse.data);
              transcriptSource = "Official YouTube API";
              console.log("✓ Successfully extracted transcript using Official YouTube API");
            }
          } catch (downloadError) {
            console.error('Error downloading captions through API:', downloadError.message);
          }
        }
      } catch (captionError) {
        console.error('Error fetching captions list through API:', captionError.message);
      }
    }
    
    
    if (!captionContent) {
      captionContent = "No transcript available. Using video description only.";
      transcriptSource = "No transcript available";
      console.log("✗ All transcript extraction methods failed, using video description only");
    }
    
    
    return {
      caption: captionContent,
      source: transcriptSource,
      fullText: `Transcript (${transcriptSource}):\n${captionContent}`
    };
  } catch (error) {
    console.error('Error fetching YouTube content:', error);
    throw new Error(`Failed to fetch YouTube content: ${error.message}`);
  }
}

/**
 * Scrape blog or article content
 */
export async function getBlogContent(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(response.data);
    
    
    const title = $('title').text() || $('h1').first().text() || '';
    
    
    
    
    let content = '';
    
    
    const possibleContentSelectors = [
      'article', '.post-content', '.entry-content', 
      '#content', '.content', 'main', '.main-content',
      '.post', '.article', '.blog-post'
    ];
    
    for (const selector of possibleContentSelectors) {
      const element = $(selector);
      if (element.length) {
        
        element.find('aside, .sidebar, .comments, .ad, .advertisement, script, style').remove();
        content = element.text().trim();
        break;
      }
    }
    
    
    if (!content) {
      
      $('script, style, nav, header, footer, aside').remove();
      content = $('body').text().trim();
    }
    
    
    content = content.replace(/\s+/g, ' ').trim();
    
    return {
      title,
      content,
      url,
      fullText: `Title: ${title}\n\n${content}`
    };
  } catch (error) {
    console.error('Error fetching blog content:', error);
    throw new Error(`Failed to fetch blog content: ${error.message}`);
  }
}