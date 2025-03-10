import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';

export const extractWords = async (videoUrl) => {
  try {
    console.log('Extracting words for video:', videoUrl);
    const response = await fetch('http://localhost:5000/extract_words', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ video_url: videoUrl })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to extract words');
    }

    const data = await response.json();
    console.log('Extracted words:', data);
    
    if (!data.words || !Array.isArray(data.words)) {
      throw new Error('Invalid response format: words array not found');
    }

    return data.words;
  } catch (error) {
    console.error('Error extracting words:', error);
    throw error;
  }
};

export const getSignLanguageVideos = async (words, quality = 'high') => {
  try {
    console.log('Getting sign language videos for words:', words);
    
    // Validate input
    if (!Array.isArray(words)) {
      console.error('Words parameter must be an array:', words);
      return [];
    }

    if (words.length === 0) {
      console.warn('Empty words array provided');
      return [];
    }

    const response = await fetch('http://localhost:5000/get_sign_language_videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        words: words.filter(word => typeof word === 'string' && word.trim()),
        quality 
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Error response from server:', errorData);
      return [];
    }

    const data = await response.json().catch(error => {
      console.error('Failed to parse response:', error);
      return {};
    });

    console.log('Received sign language videos response:', data);
    
    if (!data || !data.sign_videos) {
      console.warn('No sign_videos in response data');
      return [];
    }

    if (!Array.isArray(data.sign_videos)) {
      console.error('sign_videos is not an array:', data.sign_videos);
      return [];
    }

    // Filter out invalid videos
    const validVideos = data.sign_videos.filter(video => 
      video && 
      typeof video === 'object' && 
      typeof video.url === 'string' && 
      video.url.trim()
    );

    console.log('Valid videos found:', validVideos.length);
    return validVideos;
  } catch (error) {
    console.error('Error getting sign language videos:', error);
    return [];
  }
};