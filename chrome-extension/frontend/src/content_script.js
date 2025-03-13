import React from 'react';
import { createRoot } from 'react-dom/client';
import SignLanguageOverlay from './components/SignLanguageOverlay';
import { extractWords, getSignLanguageVideos } from './services/apiService';
import { listenForMessages } from './utils/chromeUtils';
import './styles/content_script.css';

class SignLanguageTranslator {
  constructor() {
    this.isEnabled = true;
    this.settings = { quality: 'high' };
    this.videoElement = null;
    this.overlayContainer = null;
    this.root = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryInterval = 1000;
    
    // Properties for real-time processing
    this.currentCaption = null;
    this.captionObserver = null;
    this.currentSignData = null;
    this.signCache = new Map();
    this.isProcessingWord = false;
    this.currentWord = null;
    this.isUsingAudioExtraction = false;
    
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
    const videoElement = document.querySelector('video.html5-main-video');
    if (!videoElement) {
      if (this.retryCount < this.maxRetries) {
        console.log('[SignLanguageTranslator] Video element not found, retrying in 1 second');
        this.retryCount++;
        setTimeout(() => this.findVideoElement(), this.retryInterval);
      } else {
        console.error('[SignLanguageTranslator] Failed to find video element after max retries');
        this.showError('Could not find YouTube video player');
      }
      return;
    }
    console.log('[SignLanguageTranslator] Video element found');
    this.retryCount = 0;
    this.setupVideoElement(videoElement);
  }

  setupVideoElement(videoElement) {
    this.videoElement = videoElement;
    this.createOverlayContainer();
    this.setupEventListeners();
    this.setupCaptionObserver();

    // Extract initial words from video URL
    const videoUrl = window.location.href;
    if (videoUrl.includes('youtube.com/watch')) {
      this.extractWordsFromVideo(videoUrl);
    }
  }

  getVideoId(url) {
    try {
      // Handle various YouTube URL formats
      const patterns = [
        /(?:v=|\/v\/|\/embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/,
        /(?:watch\?v=)([0-9A-Za-z_-]{11})/,
        /(?:\/video\/)([0-9A-Za-z_-]{11})/
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    } catch (error) {
      console.error('[SignLanguageTranslator] Error extracting video ID:', error);
      return null;
    }
  }

  async extractWordsFromVideo(videoUrl) {
    try {
      // Extract video ID from URL
      const videoId = this.getVideoId(videoUrl);
      if (!videoId) {
        console.error('[SignLanguageTranslator] Invalid YouTube URL:', videoUrl);
        return;
      }

      // Create clean video URL without timestamps
      const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log('[SignLanguageTranslator] Processing video:', cleanUrl);

      // First check if backend is available
      const healthCheck = await fetch('http://localhost:5000/health', {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!healthCheck.ok) {
        throw new Error('Backend server is not accessible');
      }

      console.log('[SignLanguageTranslator] Extracting words from video:', cleanUrl);
      const response = await fetch('http://localhost:5000/get_sign', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ video_url: cleanUrl })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      console.log('[SignLanguageTranslator] Server response:', data);
      
      if (data.data && Array.isArray(data.data)) {
        const words = data.data.map(item => item.word);
        console.log('[SignLanguageTranslator] Successfully extracted words:', words);
        this.isUsingAudioExtraction = true;
        
        // Process each word
        for (const word of words) {
          await this.processWord(word);
        }
      } else {
        console.log('[SignLanguageTranslator] No words extracted, falling back to captions');
        this.isUsingAudioExtraction = false;
        this.setupCaptionObserver();
      }
    } catch (error) {
      console.error('[SignLanguageTranslator] Error extracting words:', error);
      this.isUsingAudioExtraction = false;
      
      if (error.message.includes('Backend server is not accessible')) {
        console.log('[SignLanguageTranslator] Backend not available, falling back to captions');
      } else {
        console.error('[SignLanguageTranslator] Word extraction failed:', error.message);
      }
      
      // Fall back to caption observer
      this.setupCaptionObserver();
    }
  }

  setupCaptionObserver() {
    // Only set up caption observer if we're not using audio extraction
    if (this.isUsingAudioExtraction) {
      console.log('[SignLanguageTranslator] Using audio extraction, skipping caption observer');
      return;
    }

    // Try multiple possible caption container selectors
    const captionSelectors = [
      '.ytp-caption-window-container',
      '.captions-text',
      '.caption-window',
      '.ytp-caption-segment',
      'div[id^="caption-window"]',
      '.ytd-player-caption-container'
    ];

    let captionContainer = null;
    for (const selector of captionSelectors) {
      captionContainer = document.querySelector(selector);
      if (captionContainer) {
        console.log(`[SignLanguageTranslator] Found caption container with selector: ${selector}`);
        break;
      }
    }

    if (!captionContainer) {
      console.warn('[SignLanguageTranslator] Caption container not found, trying audio extraction');
      const videoUrl = window.location.href;
      if (videoUrl.includes('youtube.com/watch')) {
        this.extractWordsFromVideo(videoUrl);
      }
      return;
    }

    this.captionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          this.handleCaptionChange();
        }
      }
    });

    this.captionObserver.observe(captionContainer, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    console.log('[SignLanguageTranslator] Caption observer setup complete');
  }

  async handleCaptionChange() {
    if (this.isUsingAudioExtraction) return;

    const captionSelectors = [
      '.ytp-caption-segment',
      '.captions-text',
      '.caption-window span',
      'div[id^="caption-window"] span',
      '.ytd-player-caption-container span'
    ];

    let captionText = '';
    for (const selector of captionSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        captionText = Array.from(elements)
          .map(el => el.textContent.trim())
          .filter(text => text.length > 0)
          .join(' ');
        if (captionText) {
          console.log(`[SignLanguageTranslator] Found caption text with selector: ${selector}`);
          break;
        }
      }
    }

    if (!captionText) {
      console.debug('[SignLanguageTranslator] No caption text found');
      return;
    }

    if (captionText === this.currentCaption) {
      console.debug('[SignLanguageTranslator] Caption unchanged');
      return;
    }

    this.currentCaption = captionText;
    console.log('[SignLanguageTranslator] New caption:', captionText);

    // Process words one at a time with a small delay between each
    const words = captionText.split(/\s+/).filter(word => word.length > 0);
    console.log('[SignLanguageTranslator] Processing words:', words);
    
    for (const word of words) {
      await this.processWord(word);
      // Add a small delay between processing words to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async processWord(word) {
    try {
      if (!word || typeof word !== 'string') {
        console.error('[SignLanguageTranslator] Invalid word:', word);
        return;
      }

      // Clean and normalize the word
      const cleanWord = word.trim().toLowerCase();
      if (!cleanWord) {
        return;
      }

      // Check if we already have sign data for this word
      if (this.signCache.has(cleanWord)) {
        console.log('[SignLanguageTranslator] Using cached sign data for:', cleanWord);
        this.currentSignData = this.signCache.get(cleanWord);
        this.currentWord = cleanWord;
        this.updateOverlay();
        return;
      }

      // Prevent processing the same word multiple times
      if (this.isProcessingWord) {
        console.log('[SignLanguageTranslator] Already processing a word, skipping:', cleanWord);
        return;
      }

      this.isProcessingWord = true;
      console.log('[SignLanguageTranslator] Processing word:', cleanWord);
      
      // Use the API service instead of direct fetch
      const response = await chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: 'http://localhost:5000/get_sign',
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ word: cleanWord })
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to get sign data');
      }

      const data = response.data;
      if (!data || !data.data) {
        console.error('[SignLanguageTranslator] Invalid response format:', data);
        return;
      }

      // Extract sign data from response
      const signData = {
        keyframes: data.data.keyframes || [],
        duration: data.data.duration || 1.0,
        word: cleanWord
      };

      // Cache the sign data
      this.signCache.set(cleanWord, signData);
      
      // Update current state
      this.currentSignData = signData;
      this.currentWord = cleanWord;
      
      // Update the overlay
      this.updateOverlay();
      
      console.log('[SignLanguageTranslator] Successfully processed word:', cleanWord);
    } catch (error) {
      console.error('[SignLanguageTranslator] Error processing word:', {
        word,
        error: error.message
      });
    } finally {
      this.isProcessingWord = false;
    }
  }

  updateOverlay() {
    if (!this.root) return;
    
    this.root.render(
      <SignLanguageOverlay
        signData={this.currentSignData}
        mainVideoElement={this.videoElement}
        isEnabled={this.isEnabled}
        currentWord={this.currentWord}
      />
    );
  }

  renderOverlay() {
    if (!this.root || !this.isEnabled) return;

    console.log('[SignLanguageTranslator] Rendering overlay with:', {
      hasSignData: !!this.currentSignData,
      currentWord: this.currentWord,
      keyframeCount: this.currentSignData?.keyframes?.length,
      isEnabled: this.isEnabled
    });

    try {
      this.root.render(
        <SignLanguageOverlay
          signData={this.currentSignData}
          mainVideoElement={this.videoElement}
          isEnabled={this.isEnabled}
          currentWord={this.currentWord}
          onError={(error) => this.showError(error)}
        />
      );
    } catch (error) {
      console.error('[SignLanguageTranslator] Error rendering overlay:', error);
      this.showError('Failed to render sign language overlay');
    }
  }

  createOverlayContainer() {
    if (this.overlayContainer) {
      console.log('SignLanguageTranslator: Overlay container already exists');
      return;
    }
    
    console.log('SignLanguageTranslator: Creating overlay container');
    
    // Find the YouTube video player container
    const playerContainer = document.querySelector('#movie_player') || 
                          document.querySelector('.html5-video-player') ||
                          document.querySelector('.ytd-player');
                          
    if (!playerContainer) {
      console.warn('SignLanguageTranslator: Could not find video player container');
      return;
    }
    
    // Create our container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'sign-language-overlay-container';
    
    // Position overlay relative to the video player
    const playerRect = playerContainer.getBoundingClientRect();
    
    // Enhanced styling for better visibility and positioning
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: `${playerRect.top + 20}px`,
      right: `${window.innerWidth - playerRect.right + 20}px`,
      width: '280px',
      height: '380px',
      zIndex: '9999999',
      pointerEvents: 'none', // Allow clicks to pass through when no avatar is shown
      background: 'rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.3s ease',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      overflow: 'hidden'
    });
    
    // Add the container to the player
    playerContainer.appendChild(this.overlayContainer);
    
    // Update position on window resize
    window.addEventListener('resize', () => {
      const updatedRect = playerContainer.getBoundingClientRect();
      Object.assign(this.overlayContainer.style, {
        top: `${updatedRect.top + 20}px`,
        right: `${window.innerWidth - updatedRect.right + 20}px`
      });
    });
    
    // Create React root
    this.root = createRoot(this.overlayContainer);
    console.log('SignLanguageTranslator: React root created');
    
    // Initial render to show "Waiting for captions" state
    this.renderOverlay();
  }

  setupEventListeners() {
    if (!this.videoElement) return;

    console.log('[SignLanguageTranslator] Setting up event listeners');
    
    // Video playback events
    this.videoElement.addEventListener('play', () => {
      console.log('[SignLanguageTranslator] Video play event detected');
      this.handleVideoPlay();
    });
    this.videoElement.addEventListener('pause', () => this.handleVideoPause());
    this.videoElement.addEventListener('seeked', () => this.handleVideoSeek());
    
    // Re-setup caption observer when video changes
    this.videoElement.addEventListener('loadeddata', () => {
      console.log('[SignLanguageTranslator] Video loaded, setting up caption observer');
      setTimeout(() => this.setupCaptionObserver(), 1000); // Wait for captions to initialize
    });
  }

  async handleVideoPlay() {
    console.log('SignLanguageTranslator: Video play event');
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

  showError(message) {
    console.error('[SignLanguageTranslator] Error:', message);
    if (this.root) {
      this.root.render(
        <div className="sign-language-error">
          <p>Error: {message}</p>
          <button onClick={() => this.processWord(this.currentCaption)}>Retry</button>
        </div>
      );
    }
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
              this.processWord(this.currentCaption);
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
    if (enabled) {
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
}

// Initialize the translator when the script loads
console.log('Content Script: Creating SignLanguageTranslator instance');
new SignLanguageTranslator();