import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const SignLanguageAvatar = forwardRef(({ signData, isPlaying }, ref) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const avatarRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 1.6, 2);
    camera.lookAt(0, 1, 0);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 5;
    controls.target.set(0, 1, 0);

    // Create avatar
    const avatar = createAvatar();
    scene.add(avatar);

    // Store references
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    avatarRef.current = avatar;
    controlsRef.current = controls;

    // Start animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Create basic avatar mesh
  const createAvatar = () => {
    const avatar = new THREE.Group();

    // Create body with more human-like proportions
    const bodyGeometry = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8);
    const bodyMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x3366cc,
      shininess: 30
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9;
    avatar.add(body);

    // Head with more detail
    const headGroup = new THREE.Group();
    
    // Base head shape
    const headGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const headMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xffcc99,
      shininess: 50
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    headGroup.add(head);

    // Add eyes
    const eyeGeometry = new THREE.SphereGeometry(0.02, 16, 16);
    const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.05, 0, 0.12);
    headGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.05, 0, 0.12);
    headGroup.add(rightEye);

    // Add simple mouth
    const mouthGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.01);
    const mouthMaterial = new THREE.MeshPhongMaterial({ color: 0x994444 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.06, 0.12);
    headGroup.add(mouth);

    headGroup.position.y = 1.4;
    avatar.add(headGroup);

    // Arms with joints
    const createArm = (isLeft) => {
      const armGroup = new THREE.Group();
      
      // Upper arm
      const upperArmGeometry = new THREE.CapsuleGeometry(0.04, 0.25, 8, 8);
      const upperArm = new THREE.Mesh(upperArmGeometry, bodyMaterial);
      upperArm.position.y = -0.125;
      armGroup.add(upperArm);
      
      // Elbow joint
      const elbowGeometry = new THREE.SphereGeometry(0.04, 16, 16);
      const elbow = new THREE.Mesh(elbowGeometry, bodyMaterial);
      elbow.position.y = -0.25;
      armGroup.add(elbow);
      
      // Forearm
      const forearmGeometry = new THREE.CapsuleGeometry(0.035, 0.25, 8, 8);
      const forearm = new THREE.Mesh(forearmGeometry, bodyMaterial);
      forearm.position.y = -0.375;
      armGroup.add(forearm);
      
      // Position the entire arm
      armGroup.position.set(isLeft ? -0.3 : 0.3, 1.25, 0);
      armGroup.rotation.z = isLeft ? Math.PI / 6 : -Math.PI / 6;
      
      return armGroup;
    };
    
    const leftArm = createArm(true);
    const rightArm = createArm(false);
    avatar.add(leftArm);
    avatar.add(rightArm);

    // Hands with fingers
    const createHand = (isLeft) => {
      const handGroup = new THREE.Group();
      
      // Palm
      const palmGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.03);
      const palmMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffcc99,
        shininess: 30
      });
      const palm = new THREE.Mesh(palmGeometry, palmMaterial);
      handGroup.add(palm);
      
      // Fingers
      const fingerGeometry = new THREE.CapsuleGeometry(0.01, 0.05, 4, 4);
      const fingerMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xffcc99,
        shininess: 30
      });
      
      // Create 5 fingers
      for (let i = 0; i < 5; i++) {
        const finger = new THREE.Mesh(fingerGeometry, fingerMaterial);
        finger.position.set(
          (i - 2) * 0.015,  // Spread fingers horizontally
          0.075,            // Position above palm
          0
        );
        handGroup.add(finger);
      }
      
      // Position the entire hand
      handGroup.position.set(isLeft ? -0.45 : 0.45, 0.95, 0);
      
      return handGroup;
    };
    
    const leftHand = createHand(true);
    const rightHand = createHand(false);
    avatar.add(leftHand);
    avatar.add(rightHand);

    return avatar;
  };

  // Expose updatePose method to parent
  useImperativeHandle(ref, () => ({
    updatePose: (keyframe) => {
      if (!avatarRef.current || !keyframe) return;

      try {
        // Update hands with finger movements
        const updateHand = (handData, handMesh, isLeft) => {
          if (!handData || handData.length < 21) return;

          // Calculate hand center from palm keypoints
          const palmCenter = new THREE.Vector3(
            (handData[0] + handData[9]) / 2,
            (handData[1] + handData[10]) / 2,
            (handData[2] + handData[11]) / 2
          );

          // Update hand position
          const scaledPosition = palmCenter.multiplyScalar(0.5);
          handMesh.position.copy(scaledPosition);

          // Update finger positions
          for (let i = 0; i < 5; i++) {
            const fingerTip = new THREE.Vector3(
              handData[i * 4 + 8],
              handData[i * 4 + 9],
              handData[i * 4 + 10]
            );
            const fingerBase = new THREE.Vector3(
              handData[i * 4],
              handData[i * 4 + 1],
              handData[i * 4 + 2]
            );
            
            // Calculate finger direction and length
            const fingerDirection = fingerTip.sub(fingerBase).normalize();
            const finger = handMesh.children[i + 1]; // Skip palm (index 0)
            
            // Update finger rotation to point in the right direction
            finger.lookAt(fingerTip);
            finger.rotateX(Math.PI / 2); // Adjust for initial finger orientation
          }

          // Update arm position and rotation
          const arm = avatarRef.current.children[isLeft ? 3 : 4];
          if (arm) {
            // Calculate arm direction based on shoulder and hand position
            const shoulderPos = new THREE.Vector3(
              isLeft ? -0.3 : 0.3,
              1.25,
              0
            );
            const armDirection = scaledPosition.sub(shoulderPos);
            arm.lookAt(scaledPosition);
            arm.rotateX(Math.PI / 2);
          }
        };

        // Update left and right hands
        if (keyframe.left_hand) {
          updateHand(keyframe.left_hand, avatarRef.current.children[5], true);
        }
        if (keyframe.right_hand) {
          updateHand(keyframe.right_hand, avatarRef.current.children[6], false);
        }

        // Update body pose if available
        if (keyframe.pose && keyframe.pose.length >= 33) {
          const bodyCenter = new THREE.Vector3(
            keyframe.pose[23],
            keyframe.pose[24],
            keyframe.pose[25]
          );
          avatarRef.current.children[0].position.copy(bodyCenter.multiplyScalar(0.5));
          
          // Update head position based on face keypoints
          const head = avatarRef.current.children[1];
          const nosePos = new THREE.Vector3(
            keyframe.pose[0],
            keyframe.pose[1],
            keyframe.pose[2]
          );
          head.position.copy(nosePos.multiplyScalar(0.5));
        }
      } catch (error) {
        console.error('Error updating avatar pose:', error);
      }
    }
  }));

  return (
    <div 
      ref={containerRef} 
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: 'transparent',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      {!signData && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: '#ffffff',
          fontSize: '14px',
          textAlign: 'center'
        }}>
          Loading avatar...
        </div>
      )}
    </div>
  );
});

SignLanguageAvatar.displayName = 'SignLanguageAvatar';

export default SignLanguageAvatar;