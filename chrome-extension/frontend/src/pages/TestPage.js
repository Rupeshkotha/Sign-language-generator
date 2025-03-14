import React from 'react';
import SignLanguageTest from '../components/SignLanguageTest';
import '../styles/TestPage.css';

const TestPage = () => {
  return (
    <div className="test-page">
      <h1>Sign Language Animation Test</h1>
      <p>This page tests the sign language animation implementation with mock data.</p>
      <SignLanguageTest />
    </div>
  );
};

export default TestPage; 