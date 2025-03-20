// State management
const state = {
  activeTabId: null,
  isEnabled: false,
  quality: 'high',
  backendConnected: false,
  contentScriptReady: false,
  injectionInProgress: false
};

// Add base URL configuration
const BACKEND_URL = 'http://localhost:5000';

// Initialize state
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sign Language Translator Extension installed');
  chrome.storage.local.set({
    enabled: false,
    quality: 'high',
    backendConnected: false
  });
});

// Tab management
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
    console.log('YouTube video page loaded');
    state.activeTabId = tabId;
    state.contentScriptReady = false;
    
    // Update storage
    chrome.storage.local.set({ activeTabId: tabId });
    
    // Inject content script
    injectContentScript(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.activeTabId === tabId) {
    state.activeTabId = null;
    state.contentScriptReady = false;
    chrome.storage.local.remove('activeTabId');
  }
});

// Content script injection
async function injectContentScript(tabId) {
  if (state.injectionInProgress) {
    console.log('Content script injection already in progress');
    return;
  }

  state.injectionInProgress = true;
  try {
    console.log('Attempting to inject content script...');
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content_script.bundle.js']
    });
    
    // Wait a bit before injecting CSS
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Inject CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content_script.css']
    });
    
    console.log('Content script injected successfully');
    
    // Wait for content script to be ready
    await waitForContentScriptReady(tabId);
    
  } catch (error) {
    console.error('Failed to inject content script:', error);
    state.contentScriptReady = false;
    throw error;
  } finally {
    state.injectionInProgress = false;
  }
}

// Wait for content script to be ready
async function waitForContentScriptReady(tabId, maxAttempts = 20) {
  console.log('Waiting for content script to be ready...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await sendMessageToTab(tabId, { action: 'ping' });
      console.log('Ping response:', response);
      
      if (response?.success) {
        if (response.isInitialized) {
          state.contentScriptReady = true;
          console.log('Content script ready and initialized');
          return true;
        } else {
          console.log('Content script loaded but not initialized yet');
        }
      } else if (response?.error) {
        console.log('Content script error:', response.error);
      }
    } catch (error) {
      console.log(`Waiting for content script... attempt ${i + 1}/${maxAttempts}`);
      if (error.message.includes('Receiving end does not exist')) {
        // Content script might not be ready yet, continue waiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Content script failed to initialize after multiple attempts');
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  if (request.action === 'API_REQUEST') {
    handleApiRequest(request, sender, sendResponse);
    return true; // Keep the message channel open for async response
  }
  
  switch (request.action) {
    case 'contentScriptReady':
      handleContentScriptReady(request, sendResponse);
      break;
      
    case 'toggleTranslation':
      handleToggleTranslation(request, sendResponse);
      break;
      
    case 'checkContentScript':
      handleContentScriptCheck(sendResponse);
      break;
      
    case 'updateQuality':
      handleQualityUpdate(request, sendResponse);
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // Keep message channel open for async responses
});

// Message handlers
async function handleContentScriptReady(message, sendResponse) {
  console.log('Content script ready message received:', message);
  state.contentScriptReady = message.success;
  state.backendConnected = message.backendConnected;
  sendResponse({ success: true });
}

async function handleToggleTranslation(message, sendResponse) {
  if (!state.activeTabId) {
    sendResponse({ success: false, error: 'No active YouTube tab found' });
    return;
  }

  try {
    // Check if content script is ready
    const pingResponse = await sendMessageToTab(state.activeTabId, { action: 'ping' });
    if (!pingResponse?.success || !pingResponse.isInitialized) {
      console.log('Content script not ready, attempting injection...');
      await injectContentScript(state.activeTabId);
    }

    const response = await sendMessageToTab(state.activeTabId, {
      action: 'toggleTranslation',
      enabled: message.enabled
    });
    
    if (response?.success) {
      state.isEnabled = response.isEnabled;
      chrome.storage.local.set({ enabled: state.isEnabled });
      sendResponse(response);
    } else {
      throw new Error(response?.error || 'Failed to toggle translation');
    }
  } catch (error) {
    console.error('Toggle error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleContentScriptCheck(sendResponse) {
  if (!state.activeTabId) {
    sendResponse({ success: false, error: 'No active YouTube tab found' });
    return;
  }

  try {
    if (!state.contentScriptReady) {
      await injectContentScript(state.activeTabId);
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error('Content script check failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleQualityUpdate(message, sendResponse) {
  if (!state.activeTabId) {
    sendResponse({ success: false, error: 'No active YouTube tab found' });
    return;
  }

  try {
    state.quality = message.quality;
    chrome.storage.local.set({ quality: state.quality });
    
    const response = await sendMessageToTab(state.activeTabId, {
      action: 'updateQuality',
      quality: message.quality
    });
    
    sendResponse(response);
  } catch (error) {
    console.error('Quality update failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleApiRequest(request, sender, sendResponse) {
  try {
    const { endpoint, method, data } = request;
    if (!endpoint) {
      throw new Error('No endpoint provided in API request');
    }

    const url = `${BACKEND_URL}${endpoint}`;
    console.log('Making API request to:', url);

    // Set up fetch options
    const options = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    // Add body if data is provided
    if (data) {
      options.body = JSON.stringify(data);
    }

    // Make the request
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('API response:', result);
    sendResponse(result);
  } catch (error) {
    console.error('API request error:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// Utility functions
async function sendMessageToTab(tabId, message) {
  const maxRetries = 3;
  const retryDelay = 2000; // Increased to 2 seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, response => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            console.error(`Message send error (attempt ${attempt + 1}/${maxRetries}):`, error.message);
            reject(new Error(error.message));
          } else {
            resolve(response);
          }
        });
      });
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error('All message send attempts failed:', error.message);
        throw error;
      }
      console.log(`Retrying message send (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

// Initialize state from storage
chrome.storage.local.get(['activeTabId', 'enabled', 'quality', 'backendConnected'], (result) => {
  state.activeTabId = result.activeTabId || null;
  state.isEnabled = result.enabled || false;
  state.quality = result.quality || 'high';
  state.backendConnected = result.backendConnected || false;
});