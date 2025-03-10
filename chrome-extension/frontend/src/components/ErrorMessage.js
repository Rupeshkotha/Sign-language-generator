import React from 'react';
import '../styles/ErrorMessage.css';

const ErrorMessage = ({ message }) => (
  <div className="error-message">
    <p>{message}</p>
    <button onClick={() => window.location.reload()}>
      Try Again
    </button>
  </div>
);

export default ErrorMessage;
