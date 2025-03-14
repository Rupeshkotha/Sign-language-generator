// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sign Language Translator Extension installed');
  chrome.storage.local.set({
    enabled: false,
    quality: 'high'
  });
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
    console.log('YouTube video page loaded, injecting content script');
    
    // Inject content script
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content_script.bundle.js']
    }).then(() => {
      console.log('Content script injected successfully');
      return chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content_script.css']
      });
    }).then(() => {
      console.log('CSS injected successfully');
      // Check stored state and send to content script
      return chrome.storage.local.get(['enabled', 'quality']);
    }).then(result => {
      if (result.enabled) {
        return chrome.tabs.sendMessage(tabId, {
          action: 'toggleTranslation',
          enabled: result.enabled
        });
      }
    }).catch(err => {
      console.error('Error in content script setup:', err);
    });
  }
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  
  if (message.type === 'API_REQUEST') {
    console.log('Processing API request:', message.url);
    
    fetch(message.url, message.options)
      .then(async response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      })
      .then(data => {
        console.log('API request successful');
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('API request failed:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Failed to connect to server'
        });
      });
    return true; // Will respond asynchronously
  }
  
  if (message.action === 'checkContentScript') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ error: 'No active tab found' });
        return;
      }
      
      // Try to inject content script
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content_script.bundle.js']
      }).then(() => {
        return chrome.scripting.insertCSS({
          target: { tabId: tabs[0].id },
          files: ['content_script.css']
        });
      }).then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        // If injection fails, it might be because the script is already there
        // Try to send a ping message
        chrome.tabs.sendMessage(tabs[0].id, { action: 'ping' }, response => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: 'Content script not available' });
          } else {
            sendResponse({ success: true });
          }
        });
      });
    });
    return true; // Will respond asynchronously
  }
});