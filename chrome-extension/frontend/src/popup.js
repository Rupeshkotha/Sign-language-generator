import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css'; // Direct import from src directory

const Popup = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [quality, setQuality] = useState('high');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check backend connection first
    checkBackendConnection();
    
    // Load saved settings
    chrome.storage.local.get(['enabled', 'quality'], (result) => {
      setIsEnabled(result.enabled || false);
      setQuality(result.quality || 'high');
    });

    // Check if content script is loaded
    checkContentScript();
  }, []);

  const checkBackendConnection = async () => {
    try {
      console.log('Checking backend connection...');
      
      // Try localhost first, then 127.0.0.1 if that fails
      let response;
      try {
        response = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: 'http://192.168.29.137:5000/',
          options: {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }
        });
      } catch (localhostError) {
        console.log('Localhost connection failed, trying 127.0.0.1...');
        response = await chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: 'http://192.168.29.137:5000/',
          options: {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          }
        });
      }

      if (!response.success) {
        throw new Error(response.error || 'Backend server is not responding');
      }

      console.log('Backend connection successful');
      setIsConnected(true);
      setError(null);
    } catch (error) {
      console.error('Backend connection failed:', error);
      setIsConnected(false);
      setError('Backend server is not running. Please start the server.');
    }
  };

  const checkContentScript = () => {
    console.log('Checking content script...');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.url?.includes('youtube.com/watch')) {
        setError('Please navigate to a YouTube video page');
        return;
      }

      chrome.runtime.sendMessage({ action: 'checkContentScript' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Content script check failed:', chrome.runtime.lastError);
          setError('Failed to check content script status');
          return;
        }

        if (response?.error) {
          console.error('Content script error:', response.error);
          setError(response.error);
        } else {
          console.log('Content script check successful');
          setError(null);
        }
      });
    });
  };

  const handleToggle = async () => {
    if (!isConnected) {
      setError('Cannot enable translation: Backend is not connected');
      return;
    }

    try {
      // First check if we're on a YouTube page
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (!currentTab?.url?.includes('youtube.com/watch')) {
        setError('Please navigate to a YouTube video page');
        return;
      }

      // Try to inject the content script first
      console.log('Injecting content script...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content_script.bundle.js']
        });
        console.log('Content script injected successfully');
        
        // Also inject CSS
        await chrome.scripting.insertCSS({
          target: { tabId: currentTab.id },
          files: ['content_script.css']
        });
        console.log('CSS injected successfully');
      } catch (injectErr) {
        console.log('Injection error (might already be injected):', injectErr);
        // Continue anyway as the script might already be injected
      }

      // Function to try sending message with retries and increasing delays
      const sendMessageWithRetry = async (retries = 5, initialDelay = 1000) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Exponential backoff delay
            const delay = initialDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            console.log(`Attempt ${i + 1}: Sending ping...`);
            // Try to ping first
            const pingResponse = await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(currentTab.id, { action: 'ping' }, response => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              });
            });

            console.log('Ping response:', pingResponse);

            // If not initialized, wait and retry
            if (!pingResponse?.initialized) {
              console.log('Content script not initialized yet, waiting...');
              throw new Error('Content script not initialized');
            }

            // If initialized but overlay missing, wait a bit more
            if (!pingResponse?.overlayExists) {
              console.log('Overlay not created yet, waiting...');
              throw new Error('Overlay not created');
            }

            // If ping successful, send the actual toggle message
            const newEnabled = !isEnabled;
            const toggleResponse = await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(currentTab.id, {
                action: 'toggleTranslation',
                enabled: newEnabled
              }, response => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else if (response?.success) {
                  resolve(newEnabled);
                } else if (response?.error) {
                  reject(new Error(response.error));
                } else {
                  reject(new Error('Invalid toggle response'));
                }
              });
            });

            // If we get here, message was sent successfully
            console.log('Toggle message sent successfully');
            setIsEnabled(newEnabled);
            await chrome.storage.local.set({ enabled: newEnabled });
            setError(null);
            return; // Success, exit the function
          } catch (err) {
            console.log(`Attempt ${i + 1} failed:`, err);
            if (i === retries - 1) {
              // On last attempt, try re-injecting the content script
              console.log('Last attempt failed, trying to re-inject content script...');
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: currentTab.id },
                  files: ['content_script.bundle.js']
                });
                await chrome.scripting.insertCSS({
                  target: { tabId: currentTab.id },
                  files: ['content_script.css']
                });
                // Give it one last try after re-injection
                await new Promise(resolve => setTimeout(resolve, 2000));
                throw new Error('Failed after content script re-injection');
              } catch (finalErr) {
                throw new Error('Toggle failed after multiple retries and re-injection');
              }
            }
          }
        }
      };

      // Try to send the message with retries
      await sendMessageWithRetry();
    } catch (err) {
      console.error('Toggle operation failed:', err);
      setError('Failed to toggle translation. Please refresh the page and try again.');
      setIsEnabled(false);
      await chrome.storage.local.set({ enabled: false });
    }
  };

  const handleQualityChange = (e) => {
    const newQuality = e.target.value;
    setQuality(newQuality);
    chrome.storage.local.set({ quality: newQuality });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateQuality',
          quality: newQuality
        }).catch(err => {
          console.error('Failed to send quality update:', err);
        });
      }
    });
  };

  const handleRetry = () => {
    setError(null);
    checkBackendConnection();
    checkContentScript();
  };

  return (
    <div className="popup-container">
      <h1>Sign Language Translator</h1>
      
      {error ? (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={handleRetry}>Retry Connection</button>
        </div>
      ) : (
        <>
          <div className="control-group">
            <label className="switch">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={handleToggle}
                disabled={!isConnected}
              />
              <span className="slider round"></span>
            </label>
            <span className="label-text">
              Enable Translation
              {!isConnected && " (Backend not connected)"}
            </span>
          </div>

          <div className="control-group">
            <label htmlFor="quality">Translation Quality:</label>
            <select
              id="quality"
              value={quality}
              onChange={handleQualityChange}
              disabled={!isEnabled || !isConnected}
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
};

// Create root and render
const container = document.getElementById('root');
const root = createRoot(container);
root.render(<Popup />); 