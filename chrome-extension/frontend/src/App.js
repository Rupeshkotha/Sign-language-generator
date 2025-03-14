import React, { useState, useEffect } from 'react';
import TestPage from './pages/TestPage';
import './styles/App.css';

function App() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [quality, setQuality] = useState('high');
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Check if we're in the extension environment
    const isExtension = typeof chrome !== 'undefined' && chrome.storage;
    
    if (isExtension) {
      // Load initial state from storage in extension environment
      chrome.storage.sync.get(['translationEnabled', 'quality'], (result) => {
        setIsEnabled(result.translationEnabled || false);
        setQuality(result.quality || 'high');
      });
    } else {
      // Set default values for development environment
      setIsEnabled(true);
      setQuality('high');
    }
  }, []);

  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    
    // Check if we're in the extension environment
    const isExtension = typeof chrome !== 'undefined' && chrome.storage;
    
    if (isExtension) {
      // Save state to storage in extension environment
      chrome.storage.sync.set({ translationEnabled: newState });
      
      // Send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'toggleTranslation',
            enabled: newState,
            settings: { quality }
          });
        }
      });
    }
  };

  const handleQualityChange = (e) => {
    const newQuality = e.target.value;
    setQuality(newQuality);
    
    // Check if we're in the extension environment
    const isExtension = typeof chrome !== 'undefined' && chrome.storage;
    
    if (isExtension) {
      chrome.storage.sync.set({ quality: newQuality });
      
      if (isEnabled) {
        // Update settings in content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateSettings',
              settings: { quality: newQuality }
            });
          }
        });
      }
    }
  };

  // Check if we're on a YouTube page (only in extension environment)
  useEffect(() => {
    const isExtension = typeof chrome !== 'undefined' && chrome.tabs;
    
    if (isExtension) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const isYouTube = tabs[0].url?.includes('youtube.com/watch');
          setStatus(isYouTube ? '' : 'Please navigate to a YouTube video page');
        }
      });
    } else {
      // Set empty status for development environment
      setStatus('');
    }
  }, []);

  return (
    <div className="App">
      <TestPage />
    </div>
  );
}

export default App;