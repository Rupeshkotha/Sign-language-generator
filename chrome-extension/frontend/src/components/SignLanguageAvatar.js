import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const NUM_HAND_LANDMARKS = 21;
const NUM_POSE_LANDMARKS = 33;

const SignLanguageAvatar = ({ signData, onAnimationComplete, isPlaying }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animationRef = useRef(null);
  const jointsRef = useRef({
    leftHand: [],
    rightHand: [],
    pose: []
  });
  const animationStateRef = useRef({
    startTime: null,
    pauseTime: null,
    totalPausedTime: 0
  });

  useEffect(() => {
    console.log('SignLanguageAvatar: Initializing with data:', {
      hasSignData: !!signData,
      keyframeCount: signData?.keyframes?.length,
      duration: signData?.duration
    });

    if (!containerRef.current) {
      console.error('SignLanguageAvatar: Container ref not available');
      return;
    }

    try {
      // Set up scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.background.alpha = 0;

      // Set up camera
      const camera = new THREE.PerspectiveCamera(
        75,
        containerRef.current.clientWidth / containerRef.current.clientHeight,
        0.1,
        1000
      );
      camera.position.z = 2;  // Moved camera closer
      camera.position.y = 1;  // Adjusted height

      // Set up renderer with transparency
      const renderer = new THREE.WebGLRenderer({ 
        alpha: true,
        antialias: true 
      });
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      renderer.setClearColor(0x000000, 0);
      containerRef.current.appendChild(renderer.domElement);

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 1, 2);
      scene.add(directionalLight);

      // Create avatar
      const avatar = createAvatar();
      if (avatar) {
        scene.add(avatar);
      }

      // Add orbit controls for debugging
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Store refs
      sceneRef.current = scene;
      rendererRef.current = renderer;
      cameraRef.current = camera;

      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Clean up
      return () => {
        if (containerRef.current && renderer.domElement) {
          containerRef.current.removeChild(renderer.domElement);
        }
        // Dispose of geometries and materials
        Object.values(jointsRef.current).flat().forEach(joint => {
          if (joint.geometry) joint.geometry.dispose();
          if (joint.material) joint.material.dispose();
        });
      };
    } catch (error) {
      console.error('Error initializing avatar:', error);
    }
  }, []);

  useEffect(() => {
    if (!signData) {
      console.warn('No sign data provided');
      return;
    }

    if (!signData.keyframes || !Array.isArray(signData.keyframes)) {
      console.error('Invalid keyframes data:', signData);
      return;
    }

    console.log('Starting animation with data:', {
      frames: signData.keyframes.length,
      duration: signData.duration,
      fps: signData.fps
    });

    if (isPlaying) {
      animateSign(signData);
    }
  }, [signData, isPlaying]);

  const createJoint = (radius = 0.02, color = 0xff0000) => {
    const geometry = new THREE.SphereGeometry(radius, 8, 8);
    const material = new THREE.MeshPhongMaterial({ color });
    return new THREE.Mesh(geometry, material);
  };

  const createBone = (start, end, radius = 0.01, color = 0xcccccc) => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
    const material = new THREE.MeshPhongMaterial({ color });
    const bone = new THREE.Mesh(geometry, material);
    
    // Position and rotate the bone to connect the joints
    bone.position.copy(start);
    bone.position.addScaledVector(direction, 0.5);
    bone.lookAt(end);
    bone.rotateX(Math.PI / 2);
    
    return bone;
  };

  const createAvatar = () => {
    try {
      console.log('Creating avatar joints');
      const avatar = new THREE.Group();
      
      // Create joints for hands and pose
      const joints = {
        leftHand: Array(NUM_HAND_LANDMARKS).fill().map((_, i) => {
          const joint = createJoint(0.02, 0x00ff00); // Larger, green for left hand
          // Arrange joints in a circle for visibility
          const angle = (i / NUM_HAND_LANDMARKS) * Math.PI * 2;
          joint.position.set(
            Math.cos(angle) * 0.5,
            Math.sin(angle) * 0.5,
            0
          );
          return joint;
        }),
        rightHand: Array(NUM_HAND_LANDMARKS).fill().map((_, i) => {
          const joint = createJoint(0.02, 0x0000ff); // Larger, blue for right hand
          // Arrange joints in a circle for visibility
          const angle = (i / NUM_HAND_LANDMARKS) * Math.PI * 2;
          joint.position.set(
            Math.cos(angle) * 0.5,
            Math.sin(angle) * 0.5,
            0.5
          );
          return joint;
        }),
        pose: Array(NUM_POSE_LANDMARKS).fill().map((_, i) => {
          const joint = createJoint(0.025, 0xff0000); // Largest, red for pose
          // Arrange joints in a vertical line for visibility
          joint.position.set(
            0,
            (i / NUM_POSE_LANDMARKS) * 2 - 1,
            -0.5
          );
          return joint;
        })
      };

      // Add joints to avatar
      Object.values(joints).flat().forEach(joint => {
        if (joint) avatar.add(joint);
      });
      
      // Store joints reference
      jointsRef.current = joints;
      
      console.log('Avatar created with joints:', {
        leftHand: joints.leftHand.length,
        rightHand: joints.rightHand.length,
        pose: joints.pose.length
      });
      
      return avatar;
    } catch (error) {
      console.error('Error creating avatar:', error);
      return null;
    }
  };

  const updateJoints = (frame) => {
    if (!frame || !frame.left_hand || !frame.right_hand || !frame.pose) {
      console.error('Invalid frame data:', frame);
      return;
    }

    try {
      const scale = 0.5;  // Reduced scale to make movements more visible
      const yOffset = 1;  // Offset to center the avatar

      // Update left hand
      frame.left_hand.forEach((pos, i) => {
        const joint = jointsRef.current.leftHand[i];
        if (joint && Array.isArray(pos) && pos.length === 3) {
          joint.position.set(
            pos[0] * scale - 0.3,  // Offset to the left
            pos[1] * scale + yOffset,
            pos[2] * scale
          );
        }
      });

      // Update right hand
      frame.right_hand.forEach((pos, i) => {
        const joint = jointsRef.current.rightHand[i];
        if (joint && Array.isArray(pos) && pos.length === 3) {
          joint.position.set(
            pos[0] * scale + 0.3,  // Offset to the right
            pos[1] * scale + yOffset,
            pos[2] * scale
          );
        }
      });

      // Update pose
      frame.pose.forEach((pos, i) => {
        const joint = jointsRef.current.pose[i];
        if (joint && Array.isArray(pos) && pos.length === 3) {
          joint.position.set(
            pos[0] * scale,
            pos[1] * scale + yOffset,
            pos[2] * scale
          );
        }
      });
    } catch (error) {
      console.error('Error updating joints:', error);
    }
  };

  const animateSign = (data) => {
    if (!data || !data.keyframes || data.keyframes.length === 0) {
      console.error('Invalid animation data');
      return;
    }

    // Reset animation state
    animationStateRef.current = {
      startTime: null,
      pauseTime: null,
      totalPausedTime: 0
    };

    const animate = (currentTime) => {
      if (!animationStateRef.current.startTime) {
        animationStateRef.current.startTime = currentTime;
      }

      if (!isPlaying) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const effectiveTime = currentTime - animationStateRef.current.totalPausedTime;
      const elapsed = effectiveTime - animationStateRef.current.startTime;
      const duration = data.duration * 1000; // Convert to milliseconds
      const progress = Math.min(elapsed / duration, 1);

      // Find the current frame
      const frameIndex = Math.min(
        Math.floor(progress * data.keyframes.length),
        data.keyframes.length - 1
      );

      // Update joints with current frame
      updateJoints(data.keyframes[frameIndex]);

      if (progress >= 1) {
        if (onAnimationComplete) {
          onAnimationComplete();
        }
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '300px', 
        height: '300px',
        margin: 'auto',
        background: 'transparent'
      }}
    />
  );
};

export default SignLanguageAvatar; 