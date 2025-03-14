import React, { useState } from 'react';
import SignLanguageOverlay from './SignLanguageOverlay';

const SignLanguageTest = () => {
  const [isEnabled, setIsEnabled] = useState(true);
  const [currentWord, setCurrentWord] = useState('Hello');
  
  // Create a mock video element
  const mockVideoElement = {
    currentTime: 0,
    addEventListener: () => {},
    removeEventListener: () => {},
    play: () => {},
    pause: () => {}
  };

  // Create test sign data
  const testSignData = {
    timestamps: [0, 1, 2, 3], // 4 seconds of animation
    data: [
      {
        word: 'Hello',
        keyframes: generateTestKeyframes(),
        duration: 1.0,
        fps: 30
      },
      {
        word: 'World',
        keyframes: generateTestKeyframes(),
        duration: 1.0,
        fps: 30
      }
    ]
  };

  // Generate test keyframes
  function generateTestKeyframes() {
    const frames = [];
    const numFrames = 30; // 1 second at 30fps
    
    for (let i = 0; i < numFrames; i++) {
      const t = i / numFrames;
      frames.push({
        timestamp: t,
        left_hand: generateHandKeypoints(t, true),
        right_hand: generateHandKeypoints(t, false),
        pose: generatePoseKeypoints(t)
      });
    }
    
    return frames;
  }

  // Generate test hand keypoints
  function generateHandKeypoints(t, isLeft) {
    const points = [];
    const baseY = isLeft ? -0.2 : 0.2; // Left hand on left, right hand on right
    
    // Generate 21 hand landmarks
    for (let i = 0; i < 21; i++) {
      points.push([
        Math.sin(t * Math.PI * 2) * 0.1, // x
        baseY + Math.cos(t * Math.PI * 2) * 0.1, // y
        Math.sin(t * Math.PI) * 0.1 // z
      ]);
    }
    
    return points;
  }

  // Generate test pose keypoints
  function generatePoseKeypoints(t) {
    const points = [];
    const numPoints = 33; // Standard pose keypoints
    
    for (let i = 0; i < numPoints; i++) {
      points.push([
        Math.sin(t * Math.PI * 2) * 0.1, // x
        Math.cos(t * Math.PI * 2) * 0.1, // y
        Math.sin(t * Math.PI) * 0.1 // z
      ]);
    }
    
    return points;
  }

  return (
    <div className="sign-language-test">
      <div className="test-controls">
        <button onClick={() => setIsEnabled(!isEnabled)}>
          {isEnabled ? 'Disable' : 'Enable'} Animation
        </button>
        <button onClick={() => setCurrentWord(currentWord === 'Hello' ? 'World' : 'Hello')}>
          Toggle Word
        </button>
      </div>
      
      <SignLanguageOverlay
        signData={testSignData}
        mainVideoElement={mockVideoElement}
        isEnabled={isEnabled}
        currentWord={currentWord}
      />
    </div>
  );
};

export default SignLanguageTest; 