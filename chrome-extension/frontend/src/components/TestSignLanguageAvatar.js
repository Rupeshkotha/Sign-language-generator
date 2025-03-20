import React, { useState, useEffect } from 'react';
import SignLanguageAvatar from './SignLanguageAvatar';

// Sample pose data simulating MediaPipe output
const samplePoseData = {
  pose: Array(33).fill(null).map((_, i) => ({
    x: 0,
    y: i < 25 ? 1 : 0.5,  // Position body points higher up
    z: 0
  })),
  left_hand: Array(21).fill(null).map((_, i) => ({
    x: -0.3,
    y: 1,  // Raise hands
    z: 0
  })),
  right_hand: Array(21).fill(null).map((_, i) => ({
    x: 0.3,
    y: 1,  // Raise hands
    z: 0
  }))
};

// Test poses
const testPoses = {
  neutral: {
    pose: Array(33).fill(null).map((_, i) => ({
      x: 0,
      y: i < 25 ? 1 : 0.5,  // Keep body upright
      z: 0
    })),
    left_hand: Array(21).fill(null).map(() => ({
      x: -0.3,
      y: 1,
      z: 0
    })),
    right_hand: Array(21).fill(null).map(() => ({
      x: 0.3,
      y: 1,
      z: 0
    }))
  },
  tPose: {
    ...samplePoseData,
    pose: samplePoseData.pose.map((p, i) => ({
      x: i % 2 === 0 ? -0.5 : 0.5,  // Alternate left/right
      y: 0,
      z: 0
    }))
  },
  raiseHands: {
    ...samplePoseData,
    pose: samplePoseData.pose.map((p, i) => ({
      x: i % 2 === 0 ? -0.3 : 0.3,
      y: i < 15 ? 1 : 0,  // Raise upper body points
      z: 0
    }))
  },
  pointForward: {
    ...samplePoseData,
    left_hand: Array(21).fill(null).map((_, i) => ({
      x: -0.3,
      y: 0,
      z: i * 0.05  // Extend forward
    }))
  },
  fingerSpell: {
    ...samplePoseData,
    left_hand: Array(21).fill(null).map((_, i) => {
      // Create an 'A' handshape
      const y = i < 5 ? -0.2 : -0.5; // Thumb position vs fingers
      return {
        x: -0.3,
        y,
        z: 0
      };
    })
  },
  crossArms: {
    ...samplePoseData,
    pose: samplePoseData.pose.map((p, i) => {
      // Cross arms over chest
      if (i >= 11 && i <= 16) { // Arm indices
        return {
          x: i % 2 === 0 ? 0.2 : -0.2,
          y: 0.3,
          z: 0.3
        };
      }
      return { x: 0, y: 0, z: 0 };
    })
  }
};

function TestSignLanguageAvatar() {
  const [currentPose, setCurrentPose] = useState(testPoses.neutral);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState(2000); // milliseconds per pose

  // Initialize pose on mount
  useEffect(() => {
    setCurrentPose(testPoses.neutral);
  }, []);

  // Function to smoothly interpolate between poses
  const interpolatePoses = (startPose, endPose, progress) => {
    if (!startPose || !endPose) return null;

    const interpolate = (start, end, t) => ({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
      z: start.z + (end.z - start.z) * t
    });

    return {
      pose: startPose.pose.map((p, i) => 
        interpolate(p, endPose.pose[i], progress)
      ),
      left_hand: startPose.left_hand.map((p, i) =>
        interpolate(p, endPose.left_hand[i], progress)
      ),
      right_hand: startPose.right_hand.map((p, i) =>
        interpolate(p, endPose.right_hand[i], progress)
      )
    };
  };

  // Animation loop
  useEffect(() => {
    let animationFrame;
    let startTime = null;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / animationSpeed, 1);

      // Cycle through poses
      const poses = Object.values(testPoses);
      const currentIndex = Math.floor(progress * poses.length);
      const nextIndex = (currentIndex + 1) % poses.length;
      const poseProgress = (progress * poses.length) % 1;

      const interpolatedPose = interpolatePoses(
        poses[currentIndex],
        poses[nextIndex],
        poseProgress
      );

      setCurrentPose(interpolatedPose);

      if (isPlaying) {
        if (progress >= 1) {
          startTime = timestamp; // Reset for next cycle
        }
        animationFrame = requestAnimationFrame(animate);
      }
    };

    if (isPlaying) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      setCurrentPose(testPoses.neutral);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isPlaying, animationSpeed]);

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex',
      padding: '20px',
      gap: '20px',
      boxSizing: 'border-box',
      background: '#f5f5f5'
    }}>
      {/* Avatar Container */}
      <div style={{ 
        flex: '1',
        height: '800px', // Fixed height
        position: 'relative',
        background: '#ffffff',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <SignLanguageAvatar 
          signData={currentPose || testPoses.neutral} // Ensure we always have pose data
          isPlaying={isPlaying}
          style={{ 
            width: '100%', 
            height: '100%',
            position: 'absolute',
            top: 0,
            left: 0
          }} 
        />
      </div>
      
      {/* Controls Panel */}
      <div style={{
        width: '300px',
        height: 'fit-content',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        padding: '20px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        alignSelf: 'flex-start'
      }}>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{
            padding: '12px',
            background: isPlaying ? '#ff4444' : '#44ff44',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {isPlaying ? 'Stop Animation' : 'Start Animation'}
        </button>

        <div style={{ marginTop: '10px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px',
            fontSize: '14px',
            color: '#333'
          }}>
            Animation Speed (ms):
          </label>
          <input
            type="range"
            min="500"
            max="5000"
            step="100"
            value={animationSpeed}
            onChange={(e) => setAnimationSpeed(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <span style={{ fontSize: '14px', color: '#666' }}>{animationSpeed}ms</span>
        </div>

        <div style={{ marginTop: '10px' }}>
          <h4 style={{ 
            margin: '0 0 10px 0',
            fontSize: '16px',
            color: '#333'
          }}>
            Test Poses:
          </h4>
          {Object.entries(testPoses).map(([name, pose]) => (
            <button
              key={name}
              onClick={() => {
                setIsPlaying(false);
                setCurrentPose(pose);
              }}
              style={{
                padding: '10px',
                background: '#4444ff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '8px',
                width: '100%',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background 0.2s'
              }}
            >
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TestSignLanguageAvatar; 