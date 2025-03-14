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
  
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const lastRenderTime = useRef(0);
  const currentSignStartTime = useRef(0);
  const currentActionRef = useRef(null);

  useEffect(() => {
    if (!isEnabled) return;

    const initThreeJS = async () => {
      try {
        // Create scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;
        scene.background = new THREE.Color(0x000000);

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
        renderer.setClearColor(0x000000, 1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;

        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);

        const frontLight = new THREE.DirectionalLight(0xffffff, 1.5);
        frontLight.position.set(0, 2, 4);
        scene.add(frontLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.8);
        backLight.position.set(0, 1, -2);
        scene.add(backLight);

        // Load Mixamo model
        const loader = new GLTFLoader();
        try {
          console.log('Starting model load from:', '/models/Ch33_nonPBR.glb');
          
          // Add progress handler
          const onProgress = (xhr) => {
            console.log(`Loading model: ${(xhr.loaded / xhr.total * 100)}% loaded`);
          };

          const onError = (error) => {
            console.error('Error loading model:', error);
            setError(`Failed to load model: ${error.message}`);
          };

          // Load the model with progress tracking
          const gltf = await new Promise((resolve, reject) => {
            loader.load(
              '/models/Ch33_nonPBR.glb',
              resolve,
              onProgress,
              onError
            );
          });

          console.log('Model loaded successfully:', {
            animations: gltf.animations.length,
            scenes: gltf.scenes.length,
            materials: gltf.scene.children.filter(c => c.material).length
          });

          const model = gltf.scene;
          
          // Set model properties
          model.scale.set(2, 2, 2); // Increased scale
          model.position.set(0, -1.2, 0); // Lower position
          model.rotation.y = Math.PI;

          // Update materials for better visibility
          model.traverse((node) => {
            if (node.isMesh) {
              console.log('Found mesh:', node.name);
              if (node.material) {
                node.material.metalness = 0;
                node.material.roughness = 0.8;
                node.material.emissive.set(0x000000);
                node.material.color.set(0xffffff);
                node.material.needsUpdate = true;
                console.log('Updated material for:', node.name);
              }
            }
            if (node.isBone) {
              console.log('Found bone:', node.name);
            }
          });

          scene.add(model);
          modelRef.current = model;

          // Setup camera and controls
          camera.position.set(0, 1.2, 3.2); // Moved camera back
          camera.lookAt(0, 0.8, 0);
          
          // Add orbit controls with constraints
          const controls = new OrbitControls(camera, renderer.domElement);
          controls.enableDamping = true;
          controls.dampingFactor = 0.05;
          controls.enableZoom = true;
          controls.enablePan = false;
          
          // Constrain vertical movement
          controls.maxPolarAngle = Math.PI * 0.6;
          controls.minPolarAngle = Math.PI * 0.3;
          
          // Constrain distance
          controls.minDistance = 2.0;
          controls.maxDistance = 4.0;
          
          // Set target to upper body
          controls.target.set(0, 0.8, 0);
          controls.update();

          // Add renderer to DOM and start animation
          const container = document.querySelector('.canvas-container');
          if (container) {
            console.log('Found container, adding renderer');
            while (container.firstChild) {
              container.removeChild(container.firstChild);
            }
            container.appendChild(renderer.domElement);
            
            // Setup animation mixer
            const mixer = new THREE.AnimationMixer(model);
            mixer.timeScale = 1.0;
            mixerRef.current = mixer;
            
            // Start animation loop
            console.log('Starting animation loop');
            animate();
          } else {
            console.error('Could not find canvas container');
            setError('Could not find canvas container');
          }
        } catch (error) {
          console.error('Error loading 3D model:', error);
          setError('Failed to load 3D model. Please ensure the model file exists at /public/models/Ch33_nonPBR.glb');
          return;
        }

        // Log scene details
        console.log('Scene setup complete:', {
          children: scene.children.length,
          lights: scene.children.filter(child => child instanceof THREE.Light).length
        });
      } catch (err) {
        console.error('Error initializing Three.js:', err);
        setError('Failed to initialize 3D model');
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
    if (!isEnabled) return;

    animationFrameRef.current = requestAnimationFrame(animate);

    const deltaTime = currentTime - lastRenderTime.current;
    lastRenderTime.current = currentTime;

    if (mixerRef.current) {
      mixerRef.current.update(deltaTime * 0.001);
    }

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useEffect(() => {
    if (!isEnabled || !signData || !mainVideoElement) return;

    const handleMainVideoPlay = () => {
      setIsPlaying(true);
      if (modelRef.current) {
        // Start with the first sign if available
        if (signData.data && signData.data.length > 0) {
          console.log('Starting animation with first sign:', signData.data[0]);
          updateSignAnimation(signData.data[0]);
        }
      }
    };

    const handleMainVideoPause = () => {
      setIsPlaying(false);
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.5);
      }
    };

    const handleTimeUpdate = () => {
      if (signData.timestamps && signData.timestamps.length > 0) {
        const currentTime = mainVideoElement.currentTime;
        console.log('Current video time:', currentTime);
        const currentWordIndex = signData.timestamps.findIndex((timestamp, index) => {
          const nextTimestamp = signData.timestamps[index + 1];
          return currentTime >= timestamp && (!nextTimestamp || currentTime < nextTimestamp);
        });

        console.log('Current word index:', currentWordIndex);
        if (currentWordIndex !== -1 && currentWordIndex < signData.data.length) {
          const currentSignData = signData.data[currentWordIndex];
          console.log('Current sign data:', currentSignData);
          if (currentSignStartTime.current !== signData.timestamps[currentWordIndex]) {
            currentSignStartTime.current = signData.timestamps[currentWordIndex];
            updateSignAnimation(currentSignData);
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
      if (currentActionRef.current) {
        currentActionRef.current.fadeOut(0.5);
      }
    };
  }, [isEnabled, signData, mainVideoElement]);

  const updateSignAnimation = (signData) => {
    if (!modelRef.current || !mixerRef.current) {
      console.error('Model or mixer not initialized');
      return;
    }

    try {
      console.log('Updating sign animation with data:', {
        word: signData.word,
        numKeyframes: signData.keyframes?.length,
        duration: signData.duration,
        fps: signData.fps,
        firstFrame: signData.keyframes?.[0]
      });

      if (!signData.keyframes || signData.keyframes.length === 0) {
        console.error('No keyframes found in sign data');
        return;
      }

      // Stop any existing animation
      if (currentActionRef.current) {
        currentActionRef.current.stop();
      }

      // Create tracks for each bone
      const tracks = [];
      const bones = {};
      
      // Get all bone references first
      modelRef.current.traverse((node) => {
        if (node.isBone) {
          bones[node.name] = node;
        }
      });

      // Process keyframes
      signData.keyframes.forEach((frame, frameIndex) => {
        const time = frame.timestamp;
        
        // Process hand keypoints
        ['left_hand', 'right_hand'].forEach((handKey) => {
          const isLeft = handKey === 'left_hand';
          const handPoints = frame[handKey];
          
          if (handPoints && handPoints.length === 21) {
            const prefix = isLeft ? 'mixamorig7Left' : 'mixamorig7Right';
            
            // Calculate hand orientation
            const wrist = new THREE.Vector3().fromArray(handPoints[0]);
            const palm = new THREE.Vector3().fromArray(handPoints[9]);
            const handDir = new THREE.Vector3().subVectors(palm, wrist).normalize();
            
            // Calculate rotations
            const handRotation = new THREE.Euler();
            handRotation.x = Math.atan2(handDir.y, handDir.z);
            handRotation.y = Math.atan2(handDir.x, handDir.z) * (isLeft ? 1 : -1);
            handRotation.z = 0;
            
            // Add hand rotation track
            const handBoneName = `${prefix}Hand`;
            if (!tracks[handBoneName]) {
              tracks[handBoneName] = {
                name: `${handBoneName}.quaternion`,
                times: [],
                values: []
              };
            }
            
            tracks[handBoneName].times.push(time);
            const quat = new THREE.Quaternion().setFromEuler(handRotation);
            tracks[handBoneName].values.push(quat.x, quat.y, quat.z, quat.w);
            
            // Process fingers
            const fingerGroups = [
              { name: 'Thumb', indices: [1, 2, 3, 4] },
              { name: 'Index', indices: [5, 6, 7, 8] },
              { name: 'Middle', indices: [9, 10, 11, 12] },
              { name: 'Ring', indices: [13, 14, 15, 16] },
              { name: 'Pinky', indices: [17, 18, 19, 20] }
            ];
            
            fingerGroups.forEach(({ name, indices }) => {
              // Calculate finger rotations
              const fingerPoints = indices.map(i => new THREE.Vector3().fromArray(handPoints[i]));
              
              // Process each finger segment
              for (let i = 0; i < 3; i++) {
                const boneName = `${prefix}Hand${name}${i + 1}`;
                if (!tracks[boneName]) {
                  tracks[boneName] = {
                    name: `${boneName}.quaternion`,
                    times: [],
                    values: []
                  };
                }
                
                // Calculate segment rotation
                const start = fingerPoints[i];
                const end = fingerPoints[i + 1];
                const dir = new THREE.Vector3().subVectors(end, start).normalize();
                
                const rotation = new THREE.Euler();
                rotation.x = Math.atan2(dir.y, dir.z);
                rotation.y = Math.atan2(dir.x, dir.z) * (isLeft ? 1 : -1);
                rotation.z = 0;
                
                // Add to tracks
                tracks[boneName].times.push(time);
                const quat = new THREE.Quaternion().setFromEuler(rotation);
                tracks[boneName].values.push(quat.x, quat.y, quat.z, quat.w);
              }
            });
          }
        });
        
        // Process pose data if available
        if (frame.pose) {
          // Add pose-specific animation tracks here
          // ... existing pose processing code ...
        }
      });

      // Create animation tracks
      const trackArray = Object.values(tracks).map(track => {
        return new THREE.QuaternionKeyframeTrack(
          track.name,
          track.times,
          track.values
        );
      });

      // Create and play animation clip
      const clip = new THREE.AnimationClip('sign', signData.duration, trackArray);
      const action = mixerRef.current.clipAction(clip);
      
      action.loop = THREE.LoopOnce;
      action.clampWhenFinished = true;
      
      // Use crossfade for smooth transitions
      if (currentActionRef.current) {
        const fadeTime = 0.2;
        currentActionRef.current.crossFadeTo(action, fadeTime, true);
        setTimeout(() => {
          currentActionRef.current.stop();
          action.play();
        }, fadeTime * 1000);
      } else {
        action.play();
      }
      
      currentActionRef.current = action;
      
      console.log('Animation started:', {
        word: signData.word,
        duration: signData.duration,
        tracks: trackArray.length,
        isPlaying: action.isRunning()
      });

    } catch (error) {
      console.error('Error updating sign animation:', error);
      setError('Failed to update sign animation');
    }
  };

  // Enhanced helper functions for better animation control
  const calculatePalmNormal = (handPoints) => {
    const palmPoints = [handPoints[0], handPoints[5], handPoints[9], handPoints[13], handPoints[17]];
    const v1 = new THREE.Vector3().subVectors(palmPoints[1], palmPoints[0]);
    const v2 = new THREE.Vector3().subVectors(palmPoints[2], palmPoints[0]);
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    
    // Apply natural hand constraints
    return new THREE.Euler(
      Math.max(-Math.PI * 0.7, Math.min(Math.PI * 0.7, Math.atan2(normal.y, normal.z))),
      Math.max(-Math.PI * 0.5, Math.min(Math.PI * 0.5, Math.atan2(normal.x, normal.z))),
      Math.max(-Math.PI * 0.3, Math.min(Math.PI * 0.3, Math.atan2(normal.x, normal.y)))
    );
  };

  const calculateFingerRotation = (fingerPoints, isThumb = false) => {
    const direction = new THREE.Vector3().subVectors(
      fingerPoints[fingerPoints.length - 1],
      fingerPoints[0]
    );
    
    // Apply natural finger constraints
    return new THREE.Euler(
      Math.max(-Math.PI * 0.8, Math.min(Math.PI * 0.8, Math.atan2(direction.y, direction.z))),
      Math.max(-Math.PI * 0.4, Math.min(Math.PI * 0.4, Math.atan2(direction.x, direction.z))),
      isThumb ? // Different constraints for thumb
        Math.max(-Math.PI * 0.6, Math.min(Math.PI * 0.6, Math.atan2(direction.x, direction.y))) :
        Math.max(-Math.PI * 0.3, Math.min(Math.PI * 0.3, Math.atan2(direction.x, direction.y)))
    );
  };

  const calculateSpineRotation = (pose) => {
    const spinePoints = [pose[11], pose[23], pose[24]];
    const v1 = new THREE.Vector3().subVectors(spinePoints[1], spinePoints[0]);
    const v2 = new THREE.Vector3().subVectors(spinePoints[2], spinePoints[1]);
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    
    // Apply natural spine constraints
    return new THREE.Euler(
      Math.max(-Math.PI * 0.3, Math.min(Math.PI * 0.3, Math.atan2(normal.y, normal.z))),
      Math.max(-Math.PI * 0.3, Math.min(Math.PI * 0.3, Math.atan2(normal.x, normal.z))),
      Math.max(-Math.PI * 0.2, Math.min(Math.PI * 0.2, Math.atan2(normal.x, normal.y)))
    );
  };

  const calculateShoulderRotation = (pose, isLeft) => {
    const shoulderIndex = isLeft ? 11 : 12;
    const elbowIndex = isLeft ? 13 : 14;
    const wristIndex = isLeft ? 15 : 16;
    
    const shoulder = pose[shoulderIndex];
    const elbow = pose[elbowIndex];
    const wrist = pose[wristIndex];
    
    const upperArm = new THREE.Vector3().subVectors(elbow, shoulder);
    const forearm = new THREE.Vector3().subVectors(wrist, elbow);
    
    // Calculate natural arm chain rotations
    return new THREE.Euler(
      Math.atan2(upperArm.y, upperArm.z),
      Math.atan2(upperArm.x, upperArm.z),
      Math.atan2(forearm.x, forearm.y)
    );
  };

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
    <div className={`sign-language-overlay ${isMinimized ? 'minimized' : ''}`}>
      <div className="overlay-header">
        <h3 className="overlay-title">Sign Language Translation</h3>
        <div className="overlay-controls">
          <button className="control-button" onClick={toggleMinimize}>
            {isMinimized ? '□' : '−'}
          </button>
          <button className="control-button" onClick={handleClose}>×</button>
        </div>
      </div>
      <div className="overlay-content">
        <div className="canvas-container" />
        {error && <div className="error-message">{error}</div>}
        {currentWord && <div className="current-word">{currentWord}</div>}
      </div>
    </div>
  );
};

export default SignLanguageOverlay;