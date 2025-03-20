import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CCDIKSolver } from 'three/examples/jsm/animation/CCDIKSolver';

// Bone mapping constants
const HAND_BONES = {
  Thumb: ['mixamorig7LeftHandThumb1', 'mixamorig7LeftHandThumb2', 'mixamorig7LeftHandThumb3'],
  Index: ['mixamorig7LeftHandIndex1', 'mixamorig7LeftHandIndex2', 'mixamorig7LeftHandIndex3'],
  Middle: ['mixamorig7LeftHandMiddle1', 'mixamorig7LeftHandMiddle2', 'mixamorig7LeftHandMiddle3'],
  Ring: ['mixamorig7LeftHandRing1', 'mixamorig7LeftHandRing2', 'mixamorig7LeftHandRing3'],
  Pinky: ['mixamorig7LeftHandPinky1', 'mixamorig7LeftHandPinky2', 'mixamorig7LeftHandPinky3']
};

const POSE_BONES = {
  LeftArm: ['mixamorig7LeftShoulder', 'mixamorig7LeftArm', 'mixamorig7LeftForeArm', 'mixamorig7LeftHand'],
  RightArm: ['mixamorig7RightShoulder', 'mixamorig7RightArm', 'mixamorig7RightForeArm', 'mixamorig7RightHand'],
  Spine: ['mixamorig7Spine', 'mixamorig7Spine1', 'mixamorig7Spine2', 'mixamorig7Neck', 'mixamorig7Head']
};

// IK Chain definitions
const IK_CHAINS = {
  LeftArm: {
    target: 'LeftHandIKTarget',
    joints: ['mixamorig7LeftShoulder', 'mixamorig7LeftArm', 'mixamorig7LeftForeArm', 'mixamorig7LeftHand'],
    constraints: {
      mixamorig7LeftShoulder: { minAngle: -Math.PI/2, maxAngle: Math.PI/2 },
      mixamorig7LeftArm: { minAngle: -Math.PI/2, maxAngle: Math.PI/2 },
      mixamorig7LeftForeArm: { minAngle: -Math.PI/2, maxAngle: 0 }
    }
  },
  RightArm: {
    target: 'RightHandIKTarget',
    joints: ['mixamorig7RightShoulder', 'mixamorig7RightArm', 'mixamorig7RightForeArm', 'mixamorig7RightHand'],
    constraints: {
      mixamorig7RightShoulder: { minAngle: -Math.PI/2, maxAngle: Math.PI/2 },
      mixamorig7RightArm: { minAngle: -Math.PI/2, maxAngle: Math.PI/2 },
      mixamorig7RightForeArm: { minAngle: -Math.PI/2, maxAngle: 0 }
    }
  }
};

// Helper function to calculate bone rotations from keypoints
function calculateBoneRotation(startPoint, endPoint) {
  // Convert points to Three.js vectors
  const start = new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z);
  const end = new THREE.Vector3(endPoint.x, endPoint.y, endPoint.z);
  
  // Calculate direction vector
  const direction = end.sub(start).normalize();
  
  // Create a rotation matrix
  const matrix = new THREE.Matrix4();
  
  // Calculate forward (direction), up, and right vectors
  const forward = direction;
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  up.crossVectors(right, forward).normalize();
  
  // Set the rotation matrix
  matrix.makeBasis(right, up, forward);
  
  // Convert to quaternion
  const quaternion = new THREE.Quaternion();
  quaternion.setFromRotationMatrix(matrix);
  
  return quaternion;
}

// Helper function to calculate finger rotations with proper orientation
function calculateFingerRotations(points, baseIndex) {
  const rotations = [];
  for (let i = 0; i < 3; i++) {
    const current = points[baseIndex + i];
    const next = points[baseIndex + i + 1];
    if (current && next) {
      // Calculate initial rotation
      const rotation = calculateBoneRotation(current, next);
      
      // Add finger-specific offset rotation
      const offsetRotation = new THREE.Quaternion();
      offsetRotation.setFromEuler(new THREE.Euler(0, Math.PI/2, 0));
      rotation.multiply(offsetRotation);
      
      rotations.push(rotation);
    }
  }
  return rotations;
}

// Helper function to get finger base indices
function getFingerBaseIndex(finger) {
  const indices = {
    Thumb: 1,
    Index: 5,
    Middle: 9,
    Ring: 13,
    Pinky: 17
  };
  return indices[finger] || 0;
}

// Helper function to get pose points
function getPosePoints(part, poseData) {
  const indices = {
    LeftArm: [11, 13, 15, 17, 19],  // shoulder, upper arm, elbow, lower arm, wrist
    RightArm: [12, 14, 16, 18, 20],
    Spine: [23, 24, 25, 26, 0]  // hip, spine, chest, neck, nose
  };

  const partIndices = indices[part];
  if (!partIndices) return null;

  return partIndices.map(index => poseData[index]);
}

// Debug visualization components
function DebugPoint({ position, color = 'red', size = 0.03 }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </mesh>
  );
}

function DebugLine({ start, end, color = 'blue' }) {
  const points = [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ];
  const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);

  return (
    <line geometry={lineGeometry}>
      <lineBasicMaterial color={color} linewidth={2} />
    </line>
  );
}

function DebugVisualization({ signData, ikTargets, isEnabled }) {
  if (!isEnabled || !signData) return null;

  return (
    <group>
      {/* Pose Keypoints */}
      {signData.pose && signData.pose.map((point, index) => (
        point && <DebugPoint 
          key={`pose-${index}`} 
          position={[point.x, point.y, point.z]} 
          color="red"
        />
      ))}

      {/* Hand Keypoints */}
      {signData.left_hand && signData.left_hand.map((point, index) => (
        point && <DebugPoint 
          key={`left-hand-${index}`} 
          position={[point.x, point.y, point.z]} 
          color="green"
          size={0.02}
        />
      ))}
      
      {signData.right_hand && signData.right_hand.map((point, index) => (
        point && <DebugPoint 
          key={`right-hand-${index}`} 
          position={[point.x, point.y, point.z]} 
          color="blue"
          size={0.02}
        />
      ))}

      {/* IK Targets */}
      {ikTargets && Object.entries(ikTargets).map(([name, target]) => (
        <DebugPoint 
          key={`ik-${name}`}
          position={[target.position.x, target.position.y, target.position.z]}
          color="yellow"
          size={0.04}
        />
      ))}

      {/* Bone Connections */}
      {signData.pose && (
        <>
          {/* Spine */}
          <DebugLine 
            start={[signData.pose[23].x, signData.pose[23].y, signData.pose[23].z]}
            end={[signData.pose[24].x, signData.pose[24].y, signData.pose[24].z]}
            color="purple"
          />
          {/* Left Arm */}
          <DebugLine
            start={[signData.pose[11].x, signData.pose[11].y, signData.pose[11].z]}
            end={[signData.pose[13].x, signData.pose[13].y, signData.pose[13].z]}
            color="green"
          />
          <DebugLine
            start={[signData.pose[13].x, signData.pose[13].y, signData.pose[13].z]}
            end={[signData.pose[15].x, signData.pose[15].y, signData.pose[15].z]}
            color="green"
          />
          {/* Right Arm */}
          <DebugLine
            start={[signData.pose[12].x, signData.pose[12].y, signData.pose[12].z]}
            end={[signData.pose[14].x, signData.pose[14].y, signData.pose[14].z]}
            color="blue"
          />
          <DebugLine
            start={[signData.pose[14].x, signData.pose[14].y, signData.pose[14].z]}
            end={[signData.pose[16].x, signData.pose[16].y, signData.pose[16].z]}
            color="blue"
          />
        </>
      )}
    </group>
  );
}

// Avatar model component
function AvatarModel({ signData, isPlaying, showDebug = false }) {
  const modelRef = useRef();
  const ikSolverRef = useRef();
  const ikTargetsRef = useRef({});
  const { scene, nodes } = useGLTF('/models/Ch33_nonPBR.glb');
  const [bones, setBones] = useState({});
  const [isModelReady, setIsModelReady] = useState(false);
  const [skeleton, setSkeleton] = useState(null);

  // Set up initial pose
  useEffect(() => {
    if (!scene) {
      console.error('Scene failed to load');
      return;
    }

    console.log('Loading model...', {
      scene: scene,
      nodes: nodes,
      modelRef: modelRef.current
    });

    try {
      // Clone the scene to avoid modifying the original
      const clonedScene = scene.clone(true);
      
      // Store bone references and create IK targets
      const boneMap = {};
      
      // Debug traversal
      clonedScene.traverse((node) => {
        console.log('Node:', {
          name: node.name,
          type: node.type,
          isBone: node.isBone,
          isMesh: node.isMesh,
          isSkinnedMesh: node.isSkinnedMesh
        });

        if (node.isBone) {
          boneMap[node.name] = node;
          console.log('Found bone:', node.name);
        }
        if (node.isSkinnedMesh) {
          setSkeleton(node.skeleton);
          // Make sure mesh is visible and properly rendered
          node.frustumCulled = false;
          node.castShadow = true;
          node.receiveShadow = true;
          node.material.transparent = false;
          node.material.opacity = 1;
          console.log('Found skinned mesh:', {
            name: node.name,
            material: node.material,
            geometry: node.geometry
          });
        }
      });

      // Position and scale the model
      clonedScene.position.set(0, -1, 0); // Move down slightly
      clonedScene.rotation.set(0, Math.PI, 0); // Face the camera
      clonedScene.scale.set(1, 1, 1);

      // Add the scene to the group
      if (modelRef.current) {
        modelRef.current.clear();
        modelRef.current.add(clonedScene);
        setIsModelReady(true);
        console.log('Model added to scene');
      } else {
        console.error('Model ref not ready');
      }

      setBones(boneMap);
    } catch (error) {
      console.error('Error setting up model:', error);
    }
  }, [scene, nodes]);

  useFrame((state, delta) => {
    if (!isModelReady || !signData || !bones) return;

    // Update IK targets based on hand positions
    if (signData.pose) {
      const leftWrist = signData.pose[19];
      const rightWrist = signData.pose[20];

      if (leftWrist && ikTargetsRef.current.LeftArm) {
        // Convert from MediaPipe coordinate system to Three.js
        ikTargetsRef.current.LeftArm.position.set(
          -leftWrist.x,  // Mirror X for correct left/right
          leftWrist.y,
          -leftWrist.z  // Negate Z for forward direction
        );
      }

      if (rightWrist && ikTargetsRef.current.RightArm) {
        ikTargetsRef.current.RightArm.position.set(
          -rightWrist.x,
          rightWrist.y,
          -rightWrist.z
        );
      }

      // Update spine and body pose
      POSE_BONES.Spine.forEach((boneName, i) => {
        const bone = bones[boneName];
        const points = getPosePoints('Spine', signData.pose);
        
        if (bone && points && points[i] && points[i + 1]) {
          const start = new THREE.Vector3(-points[i].x, points[i].y, -points[i].z);
          const end = new THREE.Vector3(-points[i + 1].x, points[i + 1].y, -points[i + 1].z);
          const direction = end.sub(start).normalize();
          
          const rotationMatrix = new THREE.Matrix4();
          const up = new THREE.Vector3(0, 1, 0);
          rotationMatrix.lookAt(new THREE.Vector3(), direction, up);
          
          const quaternion = new THREE.Quaternion();
          quaternion.setFromRotationMatrix(rotationMatrix);
          bone.quaternion.copy(quaternion);
        }
      });
    }

    // Update hand poses with coordinate system conversion
    if (signData.left_hand) {
      Object.entries(HAND_BONES).forEach(([finger, boneNames]) => {
        const baseIndex = getFingerBaseIndex(finger);
        boneNames.forEach((boneName, i) => {
          const bone = bones[boneName];
          if (bone && signData.left_hand[baseIndex + i] && signData.left_hand[baseIndex + i + 1]) {
            const start = signData.left_hand[baseIndex + i];
            const end = signData.left_hand[baseIndex + i + 1];
            
            // Convert coordinates and calculate direction
            const direction = new THREE.Vector3(
              -(end.x - start.x),
              end.y - start.y,
              -(end.z - start.z)
            ).normalize();
            
            // Create rotation matrix with adjusted up vector
            const forward = direction;
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(forward, up).normalize();
            up.crossVectors(right, forward).normalize();
            
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeBasis(right, up, forward);
            
            const quaternion = new THREE.Quaternion();
            quaternion.setFromRotationMatrix(rotationMatrix);
            
            // Apply finger-specific rotation offset
            const offsetRotation = new THREE.Quaternion();
            offsetRotation.setFromEuler(new THREE.Euler(0, Math.PI/2, 0));
            quaternion.multiply(offsetRotation);
            
            bone.quaternion.copy(quaternion);
          }
        });
      });
    }

    // Apply IK
    if (ikSolverRef.current) {
      ikSolverRef.current.update();
    }

    // Update skeleton if it exists
    if (skeleton) {
      skeleton.update();
    }
  });

  return (
    <group ref={modelRef}>
      {/* Debug sphere to check scene rendering */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.1]} />
        <meshStandardMaterial color="red" />
      </mesh>
      
      <DebugVisualization 
        signData={signData} 
        ikTargets={ikTargetsRef.current}
        isEnabled={showDebug}
      />
    </group>
  );
}

const SignLanguageAvatar = React.forwardRef(({ signData, isPlaying, style }, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const containerRef = useRef();

  useEffect(() => {
    if (signData) {
      setIsLoading(false);
      console.log('Received sign data:', {
        posePoints: signData.pose?.length,
        leftHandPoints: signData.left_hand?.length,
        rightHandPoints: signData.right_hand?.length
      });
    }
  }, [signData]);

  return (
    <div ref={containerRef} style={{ 
      width: '100%', 
      height: '100%',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '600px',
      ...style
    }}>
      {/* Avatar Container */}
      <div style={{ 
        flex: 1,
        position: 'relative',
        minHeight: '600px',
        background: '#e0e0e0'
      }}>
        <Canvas
          shadows
          camera={{ 
            position: [0, 0, 3],
            fov: 50,
            near: 0.1,
            far: 1000
          }}
          style={{ 
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%'
          }}
          onCreated={({ gl, scene }) => {
            gl.setClearColor('#e0e0e0');
            scene.background = new THREE.Color('#e0e0e0');
            console.log('Canvas created', { gl, scene });
          }}
        >
          <color attach="background" args={['#e0e0e0']} />
          <ambientLight intensity={1} />
          <directionalLight 
            position={[5, 5, 5]} 
            intensity={1} 
            castShadow 
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <AvatarModel signData={signData} isPlaying={isPlaying} showDebug={showDebug} />
          <OrbitControls 
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={1}
            maxDistance={10}
            target={[0, 0, 0]}
          />
          <gridHelper args={[10, 10]} position={[0, -1, 0]} />
          <axesHelper args={[5]} />
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
            zIndex: 10
          }}>
            Loading sign language avatar...
          </div>
        )}
      </div>

      {/* Debug Controls */}
      <div style={{
        padding: '10px',
        display: 'flex',
        justifyContent: 'center',
        gap: '10px',
        background: 'rgba(0, 0, 0, 0.05)',
        borderTop: '1px solid rgba(0, 0, 0, 0.1)'
      }}>
        <button
          style={{
            padding: '8px 16px',
            background: showDebug ? '#ff4444' : '#333',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
          onClick={() => setShowDebug(!showDebug)}
        >
          {showDebug ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>
    </div>
  );
});

export default SignLanguageAvatar;