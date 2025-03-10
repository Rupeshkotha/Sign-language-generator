import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const NUM_HAND_LANDMARKS = 21;
const NUM_POSE_LANDMARKS = 33;

const SignLanguageAvatar = ({ signData, onAnimationComplete, isPlaying }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const avatarRef = useRef(null);
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
      camera.position.z = 5;

      // Set up renderer
      const renderer = new THREE.WebGLRenderer({ alpha: true });
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      containerRef.current.appendChild(renderer.domElement);

      // Create joints
      const joints = {
        leftHand: [],
        rightHand: [],
        pose: []
      };

      // Helper function to create joints
      const createJoints = (count, color, parent = scene) => {
        const joints = [];
        const geometry = new THREE.SphereGeometry(0.05, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color });
        
        for (let i = 0; i < count; i++) {
          const joint = new THREE.Mesh(geometry, material);
          parent.add(joint);
          joints.push(joint);
        }
        return joints;
      };

      // Create joints with different colors
      joints.leftHand = createJoints(21, 0x00ff00);  // Green for left hand
      joints.rightHand = createJoints(21, 0x0000ff); // Blue for right hand
      joints.pose = createJoints(33, 0xff0000);      // Red for pose

      jointsRef.current = joints;
      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;

      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();

      // Clean up
      return () => {
        if (containerRef.current && renderer.domElement) {
          containerRef.current.removeChild(renderer.domElement);
        }
        // Dispose of geometries and materials
        Object.values(joints).flat().forEach(joint => {
          if (joint.geometry) joint.geometry.dispose();
          if (joint.material) joint.material.dispose();
        });
      };
    } catch (error) {
      console.error('Error initializing avatar:', error);
    }
  }, []);

  useEffect(() => {
    if (signData && avatarRef.current) {
      console.log('SignLanguageAvatar: Updating animation with new sign data');
      // Reset animation state when sign data changes
      animationStateRef.current = {
        startTime: null,
        pauseTime: null,
        totalPausedTime: 0
      };
      
      if (isPlaying) {
        animateSign(signData);
      }
    }
  }, [signData, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      if (animationStateRef.current.startTime && !animationStateRef.current.pauseTime) {
        animationStateRef.current.pauseTime = performance.now();
      }
    } else {
      if (animationStateRef.current.pauseTime) {
        animationStateRef.current.totalPausedTime += performance.now() - animationStateRef.current.pauseTime;
        animationStateRef.current.pauseTime = null;
      }
    }
  }, [isPlaying]);

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
    if (!frame) {
      console.error('Invalid frame data');
      return;
    }

    try {
      // Scale factor to make the avatar more visible
      const scale = 2;
      const yOffset = 1; // Offset to center the avatar vertically

      // Function to update a joint position
      const updateJointPosition = (joint, position) => {
        if (joint && Array.isArray(position) && position.length >= 3) {
          joint.position.set(
            position[0] * scale,
            position[1] * scale + yOffset,
            position[2] * scale
          );
        }
      };

      // Update left hand joints
      if (Array.isArray(frame.left_hand)) {
        frame.left_hand.forEach((pos, i) => {
          if (i < jointsRef.current.leftHand.length) {
            updateJointPosition(jointsRef.current.leftHand[i], pos);
          }
        });
      }

      // Update right hand joints
      if (Array.isArray(frame.right_hand)) {
        frame.right_hand.forEach((pos, i) => {
          if (i < jointsRef.current.rightHand.length) {
            updateJointPosition(jointsRef.current.rightHand[i], pos);
          }
        });
      }

      // Update pose joints
      if (Array.isArray(frame.pose)) {
        frame.pose.forEach((pos, i) => {
          if (i < jointsRef.current.pose.length) {
            updateJointPosition(jointsRef.current.pose[i], pos);
          }
        });
      }
    } catch (error) {
      console.error('Error updating joints:', error);
    }
  };

  const animateSign = (data) => {
    if (!data || !data.keyframes || data.keyframes.length === 0) {
      console.error('Invalid animation data:', data);
      return;
    }

    console.log('Animating sign with frames:', data.keyframes.length);
    
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
      const progress = Math.min(elapsed / (data.duration * 1000), 1);
      
      // Find current and next keyframe
      const frameIndex = Math.min(
        Math.floor(progress * (data.keyframes.length - 1)),
        data.keyframes.length - 2
      );
      
      const currentFrame = data.keyframes[frameIndex];
      updateJoints(currentFrame);

      if (progress >= 1) {
        console.log('Animation complete');
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
        margin: 'auto'
      }}
    />
  );
};

export default SignLanguageAvatar; 