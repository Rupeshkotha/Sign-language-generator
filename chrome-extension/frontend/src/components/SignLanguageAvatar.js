import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, useFrame } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const SignLanguageAvatar = forwardRef(({ signData, isPlaying }, ref) => {
  const canvasRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const avatarRef = useRef(null);
  const ctxRef = useRef(null);
  const [keypoints, setKeypoints] = useState(null);
  const modelRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    // Set canvas size with device pixel ratio for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 300 * dpr;
    canvas.height = 400 * dpr;
    ctx.scale(dpr, dpr);

    // Load avatar image
    const avatar = new Image();
    avatar.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDMwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGNpcmNsZSBjeD0iMTUwIiBjeT0iMTAwIiByPSI1MCIgZmlsbD0iI0ZGQjZCNiIvPgogIDxyZWN0IHg9IjEwMCIgeT0iMTUwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI0ZGQjZCNiIvPgo8L3N2Zz4=';
    avatarRef.current = avatar;

    avatar.onload = () => {
      setIsLoading(false);
      drawAvatar();
    };

    const loader = new GLTFLoader();
    loader.load('/models/Ch33_nonPBR.glb', (gltf) => {
      modelRef.current = gltf.scene;
    });

    const receiveKeypoints = () => {
      // Implement your logic to receive keypoints
      // Update state with new keypoints
      setKeypoints(newKeypoints);
    };

    // Example: Set up WebSocket or HTTP request to get keypoints
    // ...

    return () => {
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, canvas.width, canvas.height);
      }
      // Cleanup if necessary
    };
  }, []);

  const drawAvatar = () => {
    const ctx = ctxRef.current;
    const avatar = avatarRef.current;
    if (!ctx || !avatar || !canvasRef.current) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.save();
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    ctx.drawImage(avatar, 0, 0, 300, 400);
    ctx.restore();
  };

  useImperativeHandle(ref, () => ({
    updatePose(keyframe) {
      if (!keyframe || !ctxRef.current || !canvasRef.current) return;

      try {
        drawAvatar();
        const ctx = ctxRef.current;
        
        // Draw hands with proper scaling
        ctx.save();
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        if (keyframe.left_hand) drawHand(ctx, keyframe.left_hand, 'left');
        if (keyframe.right_hand) drawHand(ctx, keyframe.right_hand, 'right');
        ctx.restore();
      } catch (error) {
        console.error('Error updating avatar:', error);
      }
    }
  }));

  const drawHand = (ctx, handData, side) => {
    const config = {
      left: { x: 100, y: 250 },
      right: { x: 200, y: 250 }
    }[side];

    // Draw palm
    ctx.beginPath();
    ctx.fillStyle = '#FFB6B6';
    ctx.strokeStyle = '#E5A5A5';
    ctx.lineWidth = 2;
    ctx.arc(config.x, config.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw fingers with improved styling
    const fingerAngles = [-0.4, -0.2, 0, 0.2, 0.4];
    handData.forEach((finger, i) => {
      if (!finger) return;

      const angle = fingerAngles[i];
      const length = 40;

      ctx.beginPath();
      ctx.moveTo(config.x, config.y);
      ctx.lineTo(
        config.x + Math.cos(angle) * length,
        config.y + Math.sin(angle) * length
      );
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#FFB6B6';
      ctx.stroke();
      
      // Add finger outline
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#E5A5A5';
      ctx.stroke();
    });
  };

  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.visible = true;
    } else {
      console.error('Model not loaded');
    }
    if (modelRef.current && keypoints) {
      // Update model's animation based on keypoints
      // Implement your animation logic here
    }
  });

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      background: 'transparent'
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '300px',
          height: '400px',
          objectFit: 'contain'
        }}
      />
      <Canvas>
        {modelRef.current && <primitive object={modelRef.current} />}
      </Canvas>
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          Loading sign language avatar...
        </div>
      )}
    </div>
  );
});

export default SignLanguageAvatar;