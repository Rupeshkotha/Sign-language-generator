import React, { useState, useEffect } from 'react';
import SignLanguageAvatar from './SignLanguageAvatar';
import '../styles/SignLanguageOverlay.css';

const SignLanguageOverlay = ({ signData, mainVideoElement, isEnabled }) => {
  const [currentSignIndex, setCurrentSignIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWord, setCurrentWord] = useState('');
  
  useEffect(() => {
    console.log('SignLanguageOverlay: Mounted with props:', { 
      hasSignData: !!signData, 
      hasMainVideo: !!mainVideoElement,
      isEnabled,
      signDataLength: signData?.length,
      firstSignSample: signData?.[0]
    });
    
    if (mainVideoElement) {
      const handleMainVideoPlay = () => {
        console.log('SignLanguageOverlay: Main video play event');
        setIsPlaying(true);
      };
      
      const handleMainVideoPause = () => {
        console.log('SignLanguageOverlay: Main video pause event');
        setIsPlaying(false);
      };
      
      mainVideoElement.addEventListener('play', handleMainVideoPlay);
      mainVideoElement.addEventListener('pause', handleMainVideoPause);
      
      return () => {
        mainVideoElement.removeEventListener('play', handleMainVideoPlay);
        mainVideoElement.removeEventListener('pause', handleMainVideoPause);
      };
    }
  }, [mainVideoElement, signData]);

  useEffect(() => {
    if (signData && signData[currentSignIndex]) {
      console.log('Setting current word:', signData[currentSignIndex].word);
      setCurrentWord(signData[currentSignIndex].word);
    }
  }, [signData, currentSignIndex]);

  const transformKeypoints = (keypoints) => {
    console.log('Raw keypoints data:', keypoints);
    
    if (!keypoints || !keypoints.keyframes) {
      console.error('Invalid keypoint data structure:', keypoints);
      return null;
    }

    try {
      // The backend already provides the data in the correct format
      const transformedData = {
        duration: keypoints.duration || keypoints.keyframes.length / 30,
        keyframes: keypoints.keyframes.map(frame => ({
          left_hand: frame.left_hand,
          right_hand: frame.right_hand,
          pose: frame.pose,
          timestamp: frame.timestamp,
          confidence: frame.confidence
        }))
      };

      console.log('Successfully transformed keypoints:', {
        frameCount: transformedData.keyframes.length,
        duration: transformedData.duration,
        sampleFrame: transformedData.keyframes[0]
      });

      return transformedData;
    } catch (error) {
      console.error('Error transforming keypoints:', error);
      return null;
    }
  };
  
  const handleAnimationComplete = () => {
    console.log('SignLanguageOverlay: Animation complete');
    if (currentSignIndex < (signData?.length || 0) - 1) {
      setCurrentSignIndex(currentSignIndex + 1);
    } else {
      // Reset to first sign if we've shown all signs
      setCurrentSignIndex(0);
    }
  };

  if (!isEnabled) {
    console.log('SignLanguageOverlay: Translation disabled');
    return null;
  }

  if (!signData || !Array.isArray(signData) || signData.length === 0) {
    console.log('SignLanguageOverlay: No sign data available');
    return (
      <div className="sign-language-overlay">
        <div className="loading-placeholder">
          Processing sign language...
        </div>
      </div>
    );
  }

  const currentSign = signData[currentSignIndex];
  console.log('Current sign data:', currentSign);
  
  const transformedSignData = transformKeypoints(currentSign?.keypoints);
  console.log('Transformed sign data available:', !!transformedSignData);

  if (!transformedSignData) {
    return (
      <div className="sign-language-overlay">
        <div className="loading-placeholder">
          Invalid keypoint data received. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="sign-language-overlay">
      <div className="avatar-container">
        <SignLanguageAvatar
          signData={transformedSignData}
          onAnimationComplete={handleAnimationComplete}
          isPlaying={isPlaying}
        />
      </div>
      
      <div className="sign-info">
        <div className="word-display">
          <span className="word-label">Current word:</span>
          <span className="word-text">{currentWord}</span>
        </div>
        
        <div className="progress-info">
          <span className="progress-text">
            Sign {currentSignIndex + 1} of {signData.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SignLanguageOverlay;
