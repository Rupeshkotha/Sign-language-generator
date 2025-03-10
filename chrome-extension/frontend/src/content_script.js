import React from 'react';
import { createRoot } from 'react-dom/client';
import SignLanguageOverlay from './components/SignLanguageOverlay';
import { extractWords, getSignLanguageVideos } from './services/apiService';
import { listenForMessages } from './utils/chromeUtils';
import './styles/content_script.css';

class SignLanguageTranslator {
  constructor() {
    this.isEnabled = false;
    this.settings = { quality: 'high' };
    this.overlayElement = null;
    this.videoCheckInterval = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryInterval = 1000;
    this.videoElement = null;
    this.overlayContainer = null;
    this.signData = null;
    this.isProcessing = false;
    this.root = null;
    
    console.log('[SignLanguageTranslator] Initializing translator');
    this.setupMessageListener();
    this.setupMutationObserver();
    this.initialize();
  }

  async initialize() {
    try {
      console.log('[SignLanguageTranslator] Checking backend availability');
      const response = await fetch('http://localhost:5000/');
      if (!response.ok) {
        throw new Error(`Backend server error: ${response.status}`);
      }
      console.log('[SignLanguageTranslator] Backend is available');
      
      this.findVideoElement();
    } catch (error) {
      console.error('[SignLanguageTranslator] Backend connection error:', error);
      this.showError('Backend server is not running. Please start the server and try again.');
    }
  }

  async findVideoElement() {
    console.log('[SignLanguageTranslator] Looking for video element');
    const videoElement = document.querySelector('video');
    if (!videoElement) {
      console.log('[SignLanguageTranslator] Video element not found, retrying in 1 second');
      setTimeout(() => this.findVideoElement(), 1000);
      return;
    }
    console.log('[SignLanguageTranslator] Video element found');
    this.setupVideoElement(videoElement);
  }

  setupVideoElement(videoElement) {
    this.videoElement = videoElement;
    this.createOverlayContainer();
    this.setupEventListeners();
  }

  createOverlayContainer() {
    if (this.overlayContainer) {
      console.log('SignLanguageTranslator: Overlay container already exists');
      return;
    }
    
    console.log('SignLanguageTranslator: Creating overlay container');
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'sign-language-overlay-container';
    document.body.appendChild(this.overlayContainer);
    
    // Create React root
    this.root = createRoot(this.overlayContainer);
    console.log('SignLanguageTranslator: React root created');
  }

  setupEventListeners() {
    if (!this.videoElement) return;

    console.log('[SignLanguageTranslator] Setting up event listeners');
    this.videoElement.addEventListener('play', () => {
      console.log('[SignLanguageTranslator] Video play event detected');
      this.handleVideoPlay();
    });
    this.videoElement.addEventListener('pause', () => this.handleVideoPause());
    this.videoElement.addEventListener('seeked', () => this.handleVideoSeek());
  }

  async handleVideoPlay() {
    console.log('SignLanguageTranslator: Video play event');
    if (!this.signData && !this.isProcessing) {
      await this.processVideo();
    }
    this.renderOverlay();
  }

  handleVideoPause() {
    console.log('SignLanguageTranslator: Video pause event');
    this.renderOverlay();
  }

  handleVideoSeek() {
    console.log('SignLanguageTranslator: Video seek event');
    this.renderOverlay();
  }

  async processVideo() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      console.log('[SignLanguageTranslator] Processing video');
      const videoUrl = window.location.href;
      console.log('SignLanguageTranslator: Processing video:', videoUrl);

      // Get the current video caption/subtitle text
      const captionText = await this.getCurrentCaptionText();
      if (!captionText) {
        throw new Error('No caption text found');
      }

      console.log('[SignLanguageTranslator] Sending request to backend');
      const signResponse = await fetch('http://localhost:5000/translate_text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: captionText }),
      });

      if (!signResponse.ok) {
        throw new Error(`Backend error: ${signResponse.status}`);
      }

      const signData = await signResponse.json();
      console.log('[SignLanguageTranslator] Received sign data:', signData);
      
      if (!signData.success) {
        throw new Error(signData.error || 'Failed to get sign language data');
      }

      // Validate the sign data structure
      if (!Array.isArray(signData.signs)) {
        console.error('Invalid sign data structure:', signData);
        throw new Error('Invalid sign data structure received from backend');
      }

      // Log detailed structure of the first sign
      if (signData.signs.length > 0) {
        const firstSign = signData.signs[0];
        console.log('First sign structure:', {
          word: firstSign.word,
          hasKeypoints: !!firstSign.keypoints,
          keypointStructure: firstSign.keypoints ? {
            type: typeof firstSign.keypoints,
            keys: Object.keys(firstSign.keypoints),
            hasFrames: Array.isArray(firstSign.keypoints.frames),
            frameCount: firstSign.keypoints.frames?.length,
            firstFrameKeys: firstSign.keypoints.frames?.[0] ? Object.keys(firstSign.keypoints.frames[0]) : null,
            firstFrameSample: firstSign.keypoints.frames?.[0]
          } : null
        });
      }

      this.signData = signData.signs;
      this.renderOverlay();
      
    } catch (error) {
      console.error('[SignLanguageTranslator] Error processing video:', error);
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async getCurrentCaptionText() {
    try {
      console.log('[SignLanguageTranslator] Getting current caption text');
      const captionElement = document.querySelector('.captions-text');
      if (!captionElement) {
        console.warn('[SignLanguageTranslator] No caption element found');
        return 'Hello world'; // Default text for testing
      }
      const text = captionElement.textContent.trim();
      console.log('[SignLanguageTranslator] Caption text:', text);
      return text;
    } catch (error) {
      console.error('[SignLanguageTranslator] Error getting caption text:', error);
      return 'Hello world'; // Default text for testing
    }
  }

  renderOverlay() {
    if (!this.overlayContainer || !this.videoElement || !this.root) {
      console.error('SignLanguageTranslator: Missing required elements for rendering');
      return;
    }

    console.log('[SignLanguageTranslator] Rendering overlay');
    this.root.render(
      <SignLanguageOverlay
        signData={this.signData}
        mainVideoElement={this.videoElement}
        isEnabled={this.isEnabled}
      />
    );
  }

  showError(message) {
    if (!this.overlayContainer) {
      this.createOverlayContainer();
    }

    if (!this.root) {
      console.error('SignLanguageTranslator: No React root available');
      return;
    }

    console.log('SignLanguageTranslator: Showing error:', message);
    this.root.render(
      <div className="sign-language-error">
        <p>{message}</p>
        <button onClick={() => this.retryProcessing()}>
          Try Again
        </button>
      </div>
    );
  }

  async retryProcessing() {
    this.retryCount = 0;
    this.isProcessing = false;
    this.signData = null;
    await this.initialize();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('SignLanguageTranslator: Received message:', message);
      try {
        switch (message.action) {
          case 'toggleTranslation':
            this.toggleTranslation(message.enabled);
            break;
          case 'updateQuality':
            this.updateSettings({ quality: message.quality });
            break;
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('SignLanguageTranslator: Error handling message:', error);
        sendResponse({ success: false, error: error.message });
      }
    });
  }

  setupMutationObserver() {
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    };

    const observer = new MutationObserver((mutations) => {
      if (this.isEnabled && !this.videoCheckInterval) {
        for (const mutation of mutations) {
          // Log mutation type and target for debugging
          console.log('DOM Mutation:', {
            type: mutation.type,
            target: mutation.target.tagName,
            targetId: mutation.target.id,
            targetClass: mutation.target.className
          });
          
          if (mutation.type === 'childList' || 
              (mutation.type === 'attributes' && mutation.target.tagName === 'VIDEO')) {
            const videoElement = this.findVideoElement();
            if (videoElement) {
              console.log('Video element found via MutationObserver');
              observer.disconnect();
              this.processVideo(videoElement);
              break;
            }
          }
        }
      }
    });

    observer.observe(document.body, config);
    console.log('MutationObserver setup complete');
  }

  toggleTranslation(enabled) {
    console.log('SignLanguageTranslator: Toggling translation:', enabled);
    this.isEnabled = enabled;
    if (enabled && !this.signData) {
      this.processVideo();
    } else {
      this.renderOverlay();
    }
  }

  updateSettings(settings) {
    console.log('SignLanguageTranslator: Updating settings:', settings);
    this.settings = { ...this.settings, ...settings };
    if (this.isEnabled) {
      this.renderOverlay();
    }
  }

  async startTranslation() {
    console.log('Starting translation attempt:', this.retryCount + 1);
    
    // Clear any existing interval
    if (this.videoCheckInterval) {
      clearInterval(this.videoCheckInterval);
    }

    // Make sure we're on a YouTube video page
    if (!window.location.href.includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video page');
    }

    // Try to find video immediately
    let videoElement = this.findVideoElement();
    console.log('Initial video element search:', videoElement ? 'found' : 'not found');
    
    if (!videoElement) {
      // If no video found, start checking periodically
      this.videoCheckInterval = setInterval(() => {
        videoElement = this.findVideoElement();
        if (videoElement) {
          console.log('Video element found via interval');
          clearInterval(this.videoCheckInterval);
          this.processVideo(videoElement);
        }
      }, 1000); // Check every second
      
      // Stop checking after 10 seconds and try to retry
      setTimeout(() => {
        if (this.videoCheckInterval) {
          clearInterval(this.videoCheckInterval);
          this.videoCheckInterval = null;
          console.log('Video search timeout reached');
          
          if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            this.startTranslation();
          } else {
            console.error('Max retries reached, could not find video element');
            this.showError('Could not find video element. Please make sure you are on a YouTube video page and the video has loaded.');
          }
        }
      }, 10000);
    } else {
      await this.processVideo(videoElement);
    }
  }

  stopTranslation() {
    if (this.videoCheckInterval) {
      clearInterval(this.videoCheckInterval);
    }
    if (this.overlayElement) {
      this.overlayElement.remove();
      this.overlayElement = null;
    }
  }

  displayErrorOverlay(message) {
    if (this.overlayElement) {
      this.overlayElement.remove();
    }

    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'sign-language-error-overlay';
    
    const errorMessage = document.createElement('div');
    errorMessage.className = 'error-message';
    errorMessage.textContent = message;

    const retryButton = document.createElement('button');
    retryButton.textContent = 'Try Again';
    retryButton.onclick = () => this.startTranslation();

    this.overlayElement.appendChild(errorMessage);
    this.overlayElement.appendChild(retryButton);
    document.body.appendChild(this.overlayElement);
  }

  displaySignLanguageOverlay(videos) {
    console.log('Displaying sign language overlay with videos:', videos);
    
    // Remove any existing overlay
    if (this.overlayElement) {
      this.overlayElement.remove();
    }

    // Create new overlay
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'sign-language-overlay';

    // Handle invalid or empty videos
    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      console.warn('No valid videos to display:', videos);
      const message = document.createElement('div');
      message.className = 'error-message';
      message.textContent = 'No sign language videos available for this content';
      
      const retryButton = document.createElement('button');
      retryButton.textContent = 'Try Again';
      retryButton.onclick = () => this.startTranslation();
      
      this.overlayElement.appendChild(message);
      this.overlayElement.appendChild(retryButton);
    } else {
      // Create video elements for each valid video
      let validVideosFound = false;
      
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        if (video && typeof video === 'object' && video.url) {
          validVideosFound = true;
          const videoElement = document.createElement('video');
          videoElement.src = video.url;
          videoElement.className = 'sign-language-video';
          videoElement.controls = true;
          this.overlayElement.appendChild(videoElement);
        }
      }

      // If no valid videos were found, show error message
      if (!validVideosFound) {
        const message = document.createElement('div');
        message.className = 'error-message';
        message.textContent = 'No valid sign language videos found';
        
        const retryButton = document.createElement('button');
        retryButton.textContent = 'Try Again';
        retryButton.onclick = () => this.startTranslation();
        
        this.overlayElement.appendChild(message);
        this.overlayElement.appendChild(retryButton);
      }
    }

    // Add the overlay to the page
    document.body.appendChild(this.overlayElement);
  }

  async extractWords(videoUrl) {
    try {
      console.log('Attempting to connect to backend at:', 'http://localhost:5000/extract_words');
      const response = await fetch('http://localhost:5000/extract_words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ video_url: videoUrl })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract words from video');
      }
      
      const data = await response.json();
      console.log('Received words from backend:', data);
      return data.words;
    } catch (error) {
      console.error('Word extraction failed:', error);
      if (error.message === 'Failed to fetch') {
        throw new Error('Cannot connect to backend server. Please make sure the backend is running on http://localhost:5000');
      }
      throw new Error(`Failed to extract words from the video: ${error.message}`);
    }
  }

  async getSignLanguageVideos(words, quality = 'high') {
    try {
      console.log('Requesting sign language videos for words:', words);
      const response = await fetch('http://localhost:5000/get_sign_language_videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ words, quality })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to retrieve sign language videos');
      }
      
      const data = await response.json();
      console.log('Received sign language videos:', data);
      return data.sign_videos;
    } catch (error) {
      console.error('Sign language video retrieval failed:', error);
      if (error.message === 'Failed to fetch') {
        throw new Error('Cannot connect to backend server. Please make sure the backend is running on http://localhost:5000');
      }
      throw new Error(`Failed to retrieve sign language videos: ${error.message}`);
    }
  }
}

// Initialize the translator when the script loads
console.log('Content Script: Creating SignLanguageTranslator instance');
new SignLanguageTranslator();