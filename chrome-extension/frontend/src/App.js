import React, { useState, useEffect } from 'react';
import './styles/App.css';

function App() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [quality, setQuality] = useState('high');
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Load initial state from storage
    chrome.storage.sync.get(['translationEnabled', 'quality'], (result) => {
      setIsEnabled(result.translationEnabled || false);
      setQuality(result.quality || 'high');
    });
  }, []);

  const handleToggle = () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    
    // Save state to storage
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
  };

  const handleQualityChange = (e) => {
    const newQuality = e.target.value;
    setQuality(newQuality);
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
  };

  // Check if we're on a YouTube page
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const isYouTube = tabs[0].url?.includes('youtube.com/watch');
        setStatus(isYouTube ? '' : 'Please navigate to a YouTube video page');
      }
    });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Sign Language Translator</h1>
      </header>
      
      <main className="App-main">
        {status ? (
          <div className="status-message">{status}</div>
        ) : (
          <>
            <div className="translation-toggle">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={handleToggle}
                />
                <span className="slider"></span>
              </label>
              <span>Enable Translation</span>
            </div>

            <div className="settings-panel">
              <label>
                Translation Quality:
                <select value={quality} onChange={handleQualityChange}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;