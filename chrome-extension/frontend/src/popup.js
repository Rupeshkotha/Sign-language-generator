import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css'; // Direct import from src directory

const Popup = () => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [quality, setQuality] = useState('high');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    initializePopup();
  }, []);

  const initializePopup = async () => {
    try {
      // Get current state
      const state = await chrome.storage.local.get(['enabled', 'quality', 'backendConnected']);
      console.log('Current state:', state);
      
      // Update state with stored values
      setIsEnabled(state.enabled || false);
      setQuality(state.quality || 'high');
      setIsConnected(state.backendConnected || false);
      
      // Check backend connection
      await checkBackendConnection();
      
    } catch (error) {
      console.error('Popup initialization error:', error);
      setError('Failed to initialize popup');
    }
  };

  const checkBackendConnection = async () => {
    try {
      console.log('Checking backend connection...');
      const response = await chrome.runtime.sendMessage({
        action: 'API_REQUEST',
        endpoint: '/health',
        method: 'GET',
        data: null
      });
      
      console.log('Backend response:', response);
      
      // Check if we got a response and it's healthy
      if (response && response.status === 'healthy') {
        setIsConnected(true);
        setError(null);
        // Update storage
        chrome.storage.local.set({ backendConnected: true });
        console.log('Backend connection successful');
      } else {
        throw new Error(response?.message || 'Backend is not healthy');
      }
    } catch (error) {
      console.error('Backend connection error:', error);
      setIsConnected(false);
      setError('Backend server is not running. Please start the server and try again.');
      // Update storage
      chrome.storage.local.set({ backendConnected: false });
    }
  };

  const handleToggle = async () => {
    try {
      if (!isConnected) {
        setError('Please ensure the backend server is running');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'toggleTranslation',
        enabled: !isEnabled
      });
      
      if (response.success) {
        const newEnabled = response.isEnabled;
        setIsEnabled(newEnabled);
        chrome.storage.local.set({ enabled: newEnabled });
        setError(null);
      } else {
        throw new Error(response.error || 'Failed to toggle translation');
      }
    } catch (error) {
      console.error('Toggle error:', error);
      setError('Failed to toggle translation');
      setIsEnabled(false);
    }
  };

  const handleQualityChange = async (e) => {
    const newQuality = e.target.value;
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateQuality',
        quality: newQuality
      });
      
      if (response.success) {
        setQuality(newQuality);
        chrome.storage.local.set({ quality: newQuality });
        setError(null);
      } else {
        throw new Error(response.error || 'Failed to update quality');
      }
    } catch (error) {
      console.error('Quality update error:', error);
      setError('Failed to update quality setting');
    }
  };

  const handleRetry = () => {
    setError(null);
    checkBackendConnection();
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