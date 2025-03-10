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
      const response = await fetch('http://localhost:5000/');
      if (!response.ok) {
        throw new Error('Backend server is not responding');
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

  const handleToggle = () => {
    if (!isConnected) {
      setError('Cannot enable translation: Backend is not connected');
      return;
    }

    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    chrome.storage.local.set({ enabled: newEnabled });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleTranslation',
          enabled: newEnabled
        }).catch(err => {
          console.error('Failed to send toggle message:', err);
          setError('Failed to enable translation. Please refresh the page.');
          setIsEnabled(false);
        });
      }
    });
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