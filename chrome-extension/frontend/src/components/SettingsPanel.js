import React, { useState, useEffect } from 'react';
import { getUserSettings } from '../utils/chromeUtils';

const SettingsPanel = ({ onSettingsChange }) => {
  const [quality, setQuality] = useState('high');

  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await getUserSettings();
      if (settings && settings.quality) {
        setQuality(settings.quality);
      }
    };
    fetchSettings();
  }, []);

  const handleQualityChange = (newQuality) => {
    setQuality(newQuality);
    onSettingsChange({ quality: newQuality });
    setUserSettings({ quality: newQuality }); // Logic to save settings
  };

  const setUserSettings = (settings) => {
    chrome.storage.sync.set(settings, () => {
      console.log('Settings saved:', settings);
    });
  };

  return (
    <div className="settings-panel">
      <h3>Translation Settings</h3>
      <div>
        <label>Video Quality:</label>
        <select 
          value={quality} 
          onChange={(e) => handleQualityChange(e.target.value)}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
  );
};

export default SettingsPanel;