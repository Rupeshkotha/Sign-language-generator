import React from 'react';
import '../styles/LoadingIndicator.css';

const LoadingIndicator = () => (
  <div className="loading-indicator">
    <div className="spinner"></div>
    <p>Processing video...</p>
  </div>
);

export default LoadingIndicator;
