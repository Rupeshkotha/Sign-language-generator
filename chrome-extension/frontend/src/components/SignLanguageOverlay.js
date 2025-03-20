import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import '../styles/SignLanguageOverlay.css';

const SignLanguageOverlay = ({ signData, mainVideoElement, isEnabled, currentWord }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [error, setError] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastRenderTime = useRef(0);
  const currentSignStartTime = useRef(0);
  const currentActionRef = useRef(null);
  const bonesRef = useRef({});

  useEffect(() => {
    if (!isEnabled) return;

    const initThreeJS = async () => {
      try {
        // Create scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = null; // Transparent background

        // Create camera with proper aspect ratio
        const camera = new THREE.PerspectiveCamera(45, 400/400, 0.1, 1000);
        camera.position.set(0, 1.6, 2.5);
        cameraRef.current = camera;

        // Create renderer with proper settings
        const renderer = new THREE.WebGLRenderer({ 
          antialias: true, 
          alpha: true,
          preserveDrawingBuffer: true
        });
        renderer.setSize(400, 400);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;

        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 1.2);
        frontLight.position.set(0, 2, 4);
        scene.add(frontLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
        backLight.position.set(0, 1, -2);
        scene.add(backLight);

        // Load model
        const loader = new GLTFLoader();
        try {
          console.log('Loading model...');
          const modelPath = chrome.runtime.getURL('models/Ch33_nonPBR.glb');
          console.log('Model path:', modelPath);
          
          const gltf = await new Promise((resolve, reject) => {
            loader.load(
              modelPath,
              resolve,
              (xhr) => console.log(`${(xhr.loaded / xhr.total * 100)}% loaded`),
              reject
            );
          });

          console.log('Model loaded successfully');

          const model = gltf.scene;
          model.scale.set(1.5, 1.5, 1.5);
          model.position.set(0, -1, 0);
          model.rotation.y = Math.PI;

          // Store bone references
          model.traverse((node) => {
            if (node.isBone) {
              bonesRef.current[node.name] = node;
              console.log('Found bone:', node.name);
            }
            if (node.isMesh) {
              node.material.metalness = 0;
              node.material.roughness = 0.5;
              node.castShadow = true;
              node.receiveShadow = true;
            }
          });

          scene.add(model);
          modelRef.current = model;
          setModelLoaded(true);

          // Setup camera and controls
          camera.position.set(0, 1.2, 2.5);
          camera.lookAt(0, 0.8, 0);
          
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.enableZoom = true;
          controls.enablePan = false;
          controls.maxPolarAngle = Math.PI * 0.6;
          controls.minPolarAngle = Math.PI * 0.3;
          controls.minDistance = 1.5;
          controls.maxDistance = 4.0;
          controls.target.set(0, 0.8, 0);
          controls.update();

          // Add renderer to DOM
          const container = document.querySelector('.canvas-container');
          if (container) {
            while (container.firstChild) {
              container.removeChild(container.firstChild);
            }
            container.appendChild(renderer.domElement);
            animate();
          }
        } catch (error) {
          console.error('Error loading model:', error);
          setError(`Failed to load model: ${error.message}`);
        }
      } catch (err) {
        console.error('Error initializing Three.js:', err);
        setError('Failed to initialize 3D viewer');
      }
    };

    initThreeJS();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, [isEnabled]);

  const animate = (currentTime = 0) => {
    if (!isEnabled || !modelLoaded) return;

    animationFrameRef.current = requestAnimationFrame(animate);

    const deltaTime = (currentTime - lastRenderTime.current) * 0.001;
    lastRenderTime.current = currentTime;

    if (mixerRef.current) {
      mixerRef.current.update(deltaTime);
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  const updatePose = (keyframe) => {
    if (!modelRef.current || !bonesRef.current) return;

    // Update hand bones
    const updateHand = (handData, prefix) => {
      handData.forEach((point, index) => {
        const boneName = `${prefix}${index}`;
        const bone = bonesRef.current[boneName];
        if (bone) {
          bone.rotation.set(
            THREE.MathUtils.degToRad(point[0] * 180),
            THREE.MathUtils.degToRad(point[1] * 180),
            THREE.MathUtils.degToRad(point[2] * 180)
          );
        }
      });
    };

    // Update pose bones
    keyframe.pose.forEach((point, index) => {
      const boneName = `pose_${index}`;
      const bone = bonesRef.current[boneName];
      if (bone) {
        bone.rotation.set(
          THREE.MathUtils.degToRad(point[0] * 180),
          THREE.MathUtils.degToRad(point[1] * 180),
          THREE.MathUtils.degToRad(point[2] * 180)
        );
      }
    });

    updateHand(keyframe.left_hand, 'leftHand_');
    updateHand(keyframe.right_hand, 'rightHand_');
  };

  useEffect(() => {
    if (!isEnabled || !signData || !modelLoaded) return;

    let frameIndex = 0;
    const frames = signData.keyframes || [];
    
    const animateSign = () => {
      if (frameIndex < frames.length) {
        updatePose(frames[frameIndex]);
        frameIndex++;
        setTimeout(animateSign, 1000 / 30); // 30 FPS
      }
    };

    animateSign();
  }, [signData, isEnabled, modelLoaded]);

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  const handleClose = () => {
    setIsVisible(false);
  };

  // Add detailed logging for sign data
  useEffect(() => {
    if (signData) {
      console.log('Received sign data:', {
        fullData: signData,
        dataLength: signData.data ? signData.data.length : 0,
        timestamps: signData.timestamps,
        sampleData: signData.data ? signData.data[0] : null,
        hasKeyframes: signData.data ? signData.data[0]?.keyframes?.length > 0 : false
      });
    }
  }, [signData]);

  if (!isVisible) return null;

  return (
    <div className={`sign-language-overlay ${isMinimized ? 'minimized' : ''} ${!isVisible ? 'hidden' : ''}`}>
      <div className="overlay-header">
        <span className="current-word">{currentWord || 'Sign Language'}</span>
        <div className="overlay-controls">
          <button onClick={toggleMinimize}>
            {isMinimized ? '□' : '−'}
          </button>
          <button onClick={handleClose}>×</button>
        </div>
      </div>
      <div className="canvas-container">
        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );
};

export default SignLanguageOverlay;