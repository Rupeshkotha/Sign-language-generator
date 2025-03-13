import React, { useRef, useEffect, useState } from 'react';
import SignLanguageAvatar from './SignLanguageAvatar';
import '../styles/SignLanguageOverlay.css';

const SignLanguageOverlay = ({ signData, mainVideoElement, isEnabled, currentWord }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const animationFrameRef = useRef(null);
  const lastRenderTime = useRef(0);
  const avatarRef = useRef(null);
  const currentSignStartTime = useRef(0);

  useEffect(() => {
    console.log('SignLanguageOverlay: Mounted with props:', {
      hasSignData: !!signData,
      hasMainVideo: !!mainVideoElement,
      isEnabled,
      currentWord
    });

    if (!signData || !mainVideoElement) {
      return;
    }

    const handleMainVideoPlay = () => {
      console.log('Main video play event');
      setIsPlaying(true);
      if (avatarRef.current) {
        startAnimation();
      }
    };

    const handleMainVideoPause = () => {
      console.log('Main video pause event');
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };

    const handleTimeUpdate = () => {
      // Update sign language based on video time
      if (signData.timestamps && signData.timestamps.length > 0) {
        const currentTime = mainVideoElement.currentTime;
        const currentWordIndex = signData.timestamps.findIndex((timestamp, index) => {
          const nextTimestamp = signData.timestamps[index + 1];
          return currentTime >= timestamp && (!nextTimestamp || currentTime < nextTimestamp);
        });

        if (currentWordIndex !== -1 && currentWordIndex < signData.data.length) {
          const currentSignData = signData.data[currentWordIndex];
          if (currentSignStartTime.current !== signData.timestamps[currentWordIndex]) {
            currentSignStartTime.current = signData.timestamps[currentWordIndex];
            console.log('Switching to word:', currentSignData.word);
          }
        }
      }
    };

    mainVideoElement.addEventListener('play', handleMainVideoPlay);
    mainVideoElement.addEventListener('pause', handleMainVideoPause);
    mainVideoElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      mainVideoElement.removeEventListener('play', handleMainVideoPlay);
      mainVideoElement.removeEventListener('pause', handleMainVideoPause);
      mainVideoElement.removeEventListener('timeupdate', handleTimeUpdate);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [mainVideoElement, signData]);

  const startAnimation = () => {
    if (!signData || !signData.data || !isPlaying) {
      return;
    }

    const animate = (currentTime) => {
      if (!isPlaying) return;

      const deltaTime = currentTime - lastRenderTime.current;
      lastRenderTime.current = currentTime;

      // Get current video time and find corresponding sign data
      const videoTime = mainVideoElement.currentTime;
      let currentSignData = null;
      let currentTimestamp = 0;

      if (signData.timestamps && signData.timestamps.length > 0) {
        const currentIndex = signData.timestamps.findIndex((timestamp, index) => {
          const nextTimestamp = signData.timestamps[index + 1];
          return videoTime >= timestamp && (!nextTimestamp || videoTime < nextTimestamp);
        });

        if (currentIndex !== -1 && currentIndex < signData.data.length) {
          currentSignData = signData.data[currentIndex];
          currentTimestamp = signData.timestamps[currentIndex];
        }
      }

      if (currentSignData) {
        // Calculate progress within current sign
        const signDuration = currentSignData.duration || 1.0;
        const timeSinceStart = videoTime - currentTimestamp;
        const progress = (timeSinceStart % signDuration) / signDuration;
        
        // Get frame based on progress
        const frameIndex = Math.min(
          Math.floor(progress * currentSignData.keyframes.length),
          currentSignData.keyframes.length - 1
        );

        // Update avatar pose
        if (avatarRef.current) {
          avatarRef.current.updatePose(currentSignData.keyframes[frameIndex]);
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    lastRenderTime.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  if (!isEnabled) {
    return null;
  }

  if (!signData) {
    return (
      <div className="sign-language-overlay">
        <div className="loading-placeholder">
          Waiting for captions...
        </div>
      </div>
    );
  }

  return (
    <div className="sign-language-overlay">
      <div className="avatar-container">
        <SignLanguageAvatar
          ref={avatarRef}
          signData={signData}
          isPlaying={isPlaying}
        />
      </div>
      <div className="sign-info">
        <div className="word-display">
          <span className="word-label">Current word:</span>
          <span className="word-text">{currentWord || 'Waiting...'}</span>
        </div>
      </div>
    </div>
  );
};

export default SignLanguageOverlay;
