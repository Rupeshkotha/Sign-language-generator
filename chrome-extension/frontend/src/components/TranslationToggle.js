import React from 'react';

const TranslationToggle = ({ isEnabled, onToggle }) => {
  return (
    <div className="translation-toggle">
      <label className="switch">
        <input 
          type="checkbox" 
          checked={isEnabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="slider"></span>
      </label>
      <span>{isEnabled ? 'Translation On' : 'Translation Off'}</span>
    </div>
  );
};

export default TranslationToggle;