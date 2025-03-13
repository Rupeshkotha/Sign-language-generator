import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';

// Helper function to make API requests through background script
const makeRequest = async (url, options) => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url,
      options
    });

    if (!response.success) {
      throw new Error(response.error);
    }

    return response.data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Helper function to check server health
const checkServerHealth = async () => {
  try {
    const data = await makeRequest(`${API_BASE_URL}/health`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log('Backend health status:', data);
    return data.status === 'healthy';
  } catch (error) {
    console.error('Server health check failed:', error);
    return false;
  }
};

export const extractWords = async (videoUrl) => {
  try {
    // Check server health first
    const isServerHealthy = await checkServerHealth();
    if (!isServerHealthy) {
      throw new Error('Backend server is not accessible. Please ensure the server is running.');
    }

    console.log('Extracting words for video:', videoUrl);
    const data = await makeRequest(`${API_BASE_URL}/get_sign`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ video_url: videoUrl })
    });

    console.log('Server response:', data);
    
    // Extract words from the response data
    if (data.data && Array.isArray(data.data)) {
      const words = data.data.map(item => item.word);
      console.log('Extracted words:', words);
      return words;
    } else if (data.error) {
      throw new Error(data.error);
    } else {
      console.error('Invalid response format:', data);
      throw new Error('Invalid response format: words array not found');
    }
  } catch (error) {
    console.error('Error extracting words:', {
      message: error.message,
      stack: error.stack,
      videoUrl
    });
    throw error;
  }
};

export const getSignLanguageVideos = async (words, quality = 'high') => {
  try {
    // Check server health first
    const isServerHealthy = await checkServerHealth();
    if (!isServerHealthy) {
      throw new Error('Backend server is not accessible. Please ensure the server is running.');
    }

    console.log('Getting sign language videos for words:', words);
    
    if (!Array.isArray(words)) {
      console.error('Invalid words parameter:', words);
      throw new Error('Words parameter must be an array');
    }

    if (words.length === 0) {
      console.warn('Empty words array provided');
      return [];
    }

    const data = await makeRequest(`${API_BASE_URL}/get_sign_language_videos`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ words, quality })
    });

    return data.videos;
  } catch (error) {
    console.error('Error getting sign language videos:', {
      message: error.message,
      stack: error.stack,
      words
    });
    throw error;
  }
};

export const getSignLanguage = async (videoUrl) => {
  try {
    // Check server health first
    const isServerHealthy = await checkServerHealth();
    if (!isServerHealthy) {
      throw new Error('Backend server is not accessible. Please ensure the server is running.');
    }

    console.log('Getting sign language for video:', videoUrl);
    const data = await makeRequest(`${API_BASE_URL}/get_sign`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ video_url: videoUrl })
    });

    // Log the response status
    console.log('Response status:', data.status);
    
    if (!data.success) {
      const errorData = data.error;
      console.error('Server response error:', {
        error: errorData
      });
      throw new Error(errorData || `Server error`);
    }

    console.log('Backend response:', data);

    // Validate the response structure
    if (!data.success || !Array.isArray(data.data)) {
      console.error('Invalid response format:', data);
      throw new Error('Invalid response format from backend');
    }

    return data.data;
  } catch (error) {
    console.error('Error in getSignLanguage:', {
      message: error.message,
      stack: error.stack,
      videoUrl
    });
    throw error;
  }
};