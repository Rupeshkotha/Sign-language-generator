import React, { useState } from 'react';
import TranslationToggle from '../components/TranslationToggle';
import SettingsPanel from '../components/SettingsPanel';
import { sendMessageToActiveTab } from '../utils/chromeUtils';

const Popup = () => {
  const [isTranslationEnabled, setTranslationEnabled] = useState(false);
  const [settings, setSettings] = useState({ quality: 'high' });

  const handleTranslationToggle = (enabled) => {
    setTranslationEnabled(enabled);
    sendMessageToActiveTab({
      action: 'toggleTranslation',
      enabled,
      settings
    });
  };

  const handleSettingsChange = (newSettings) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      ...newSettings
    }));
    sendMessageToActiveTab({
      action: 'updateSettings',
      settings: { ...settings, ...newSettings }
    });
  };

  return (
    <div className="popup-container">
      <h1>Sign Language Translator</h1>
      <TranslationToggle 
        isEnabled={isTranslationEnabled}
        onToggle={handleTranslationToggle}
      />
      <SettingsPanel 
        onSettingsChange={handleSettingsChange}
      />
    </div>
  );
};

export default Popup;