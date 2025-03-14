import React from 'react';
import { createRoot } from 'react-dom/client';
import SignLanguageOverlay from './components/SignLanguageOverlay';
import { extractWords, getSignLanguageVideos } from './services/apiService';
import { listenForMessages } from './utils/chromeUtils';
import './styles/content_script.css';

let overlayRoot = null;
let isEnabled = false;
let quality = 'high';
let currentWord = '';
let signData = null;
let isInitialized = false;

// Function to check if captions are enabled
const areCaptionsEnabled = () => {
  const captionsButton = document.querySelector('.ytp-subtitles-button');
  return captionsButton?.getAttribute('aria-pressed') === 'true';
};

// Function to handle caption button clicks
const handleCaptionButtonClick = () => {
  if (!isEnabled) return;
  
  // Wait a short moment for YouTube's caption state to update
  setTimeout(() => {
    const captionsEnabled = areCaptionsEnabled();
    if (captionsEnabled && overlayRoot) {
      overlayRoot.style.display = 'block';
    } else if (overlayRoot) {
      overlayRoot.style.display = 'none';
    }
  }, 100);
};

// Setup video time observer
const setupVideoTimeObserver = () => {
  const video = document.querySelector('video');
  if (!video) return;

  let lastTime = -1;
  const checkTime = () => {
    if (!isEnabled) return;
    const currentTime = Math.floor(video.currentTime);
    if (currentTime !== lastTime) {
      lastTime = currentTime;
      // Here you would update signData based on the current time
      // This is where you'd make API calls to get sign data
    }
  };

  video.addEventListener('timeupdate', checkTime);
};

// Broadcast ready state to anyone listening
const broadcastReady = () => {
  chrome.runtime.sendMessage({ 
    action: 'contentScriptReady',
    tabId: chrome.runtime.id
  }).catch(() => {
    // Ignore errors, as popup might not be open
  });
};

// Initialize overlay
const initializeOverlay = () => {
  if (!overlayRoot) {
    try {
      overlayRoot = document.createElement('div');
      overlayRoot.id = 'sign-language-overlay-root';
      document.body.appendChild(overlayRoot);
      
      // Create React root and render component
      const root = createRoot(overlayRoot);
      root.render(
        <SignLanguageOverlay
          signData={signData}
          mainVideoElement={document.querySelector('video')}
          isEnabled={isEnabled}
          currentWord={currentWord}
        />
      );
      
      // Initially hide overlay if captions are disabled
      if (!areCaptionsEnabled()) {
        overlayRoot.style.display = 'none';
      }
      console.log('Overlay initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize overlay:', error);
      return false;
    }
  }
  return true;
};

// Watch for caption button
const setupCaptionButtonObserver = () => {
  const captionsButton = document.querySelector('.ytp-subtitles-button');
  if (captionsButton) {
    captionsButton.addEventListener('click', handleCaptionButtonClick);
  }
};

// Initialize everything when the page is ready
const initialize = () => {
  console.log('Starting initialization...');
  
  // Try immediate initialization first
  if (document.querySelector('.html5-video-player')) {
    console.log('Player found immediately');
    completeInitialization();
    return;
  }

  // If not ready, wait and retry
  console.log('Player not found, setting up observer...');
  const observer = new MutationObserver((mutations, obs) => {
    if (document.querySelector('.html5-video-player')) {
      console.log('Player found via observer');
      obs.disconnect();
      completeInitialization();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Fallback timeout after 10 seconds
  setTimeout(() => {
    observer.disconnect();
    if (!isInitialized) {
      console.log('Timeout reached, forcing initialization...');
      completeInitialization();
    }
  }, 10000);
};

const completeInitialization = () => {
  try {
    console.log('Completing initialization...');
    
    // Initialize overlay
    if (!initializeOverlay()) {
      throw new Error('Failed to initialize overlay');
    }
    
    // Setup caption button observer
    setupCaptionButtonObserver();
    
    // Setup video time observer
    setupVideoTimeObserver();

    // Mark as initialized
    isInitialized = true;
    console.log('Content script fully initialized');
    
    // Broadcast ready state
    broadcastReady();
  } catch (error) {
    console.error('Initialization failed:', error);
    // Try to recover by retrying once after a delay
    setTimeout(() => {
      if (!isInitialized) {
        console.log('Retrying initialization...');
        completeInitialization();
      }
    }, 2000);
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.action, 'Initialized:', isInitialized);
  
  // Always respond to ping, even if not initialized
  if (request.action === 'ping') {
    sendResponse({ 
      success: true, 
      initialized: isInitialized,
      overlayExists: !!overlayRoot
    });
    return true;
  }

  // For all other actions, ensure we're initialized
  if (!isInitialized) {
    console.log('Not initialized, attempting initialization...');
    initialize();
    sendResponse({ 
      success: false, 
      error: 'Content script initializing, please retry' 
    });
    return true;
  }

  console.log('Processing message:', request.action);
  
  try {
    if (request.action === 'toggleTranslation') {
      isEnabled = request.enabled;
      if (overlayRoot) {
        if (isEnabled && areCaptionsEnabled()) {
          overlayRoot.style.display = 'block';
        } else {
          overlayRoot.style.display = 'none';
        }
        sendResponse({ success: true });
      } else {
        // Try to reinitialize if overlay is missing
        initializeOverlay();
        sendResponse({ 
          success: false, 
          error: 'Overlay reinitialized, please retry' 
        });
      }
      return true;
    } else if (request.action === 'updateQuality') {
      quality = request.quality;
      sendResponse({ success: true });
      return true;
    } else if (request.action === 'checkContentScript') {
      sendResponse({ 
        success: true, 
        initialized: isInitialized,
        overlayExists: !!overlayRoot 
      });
      return true;
    }
  } catch (error) {
    console.error('Error processing message:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
    return true;
  }
  return false;
});

// Start initialization
console.log('Content script loaded, starting initialization...');
initialize();