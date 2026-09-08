"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useRef, useMemo, memo } from "react";
import * as THREE from "three";

// 3D DNA Helix Component (Optimized)
const DNAHelix = memo(function DNAHelix() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.3;
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.5;
    }
  });

  const numPairs = 15;
  const radius = 2;
  const spacing = 1.2;

  const pairs = useMemo(() => {
    return Array.from({ length: numPairs }).map((_, i) => {
      const angle = (i / numPairs) * Math.PI * 4; // Two full twists
      const y = (i - numPairs / 2) * spacing;
      
      const x1 = Math.cos(angle) * radius;
      const z1 = Math.sin(angle) * radius;
      const x2 = Math.cos(angle + Math.PI) * radius;
      const z2 = Math.sin(angle + Math.PI) * radius;
      
      return { x1, z1, x2, z2, y, angle };
    });
  }, []);

  // Shared geometries and materials for massive performance boost
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.4, 16, 16), []);
  const cylGeo = useMemo(() => new THREE.CylinderGeometry(0.08, 0.08, radius * 2, 8), []);
  
  const matLeft = useMemo(() => new THREE.MeshStandardMaterial({ color: "#10b981", roughness: 0.1, metalness: 0.8, emissive: "#10b981", emissiveIntensity: 1, transparent: true, opacity: 0.3 }), []);
  const matRight = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8b5cf6", roughness: 0.1, metalness: 0.8, emissive: "#8b5cf6", emissiveIntensity: 1, transparent: true, opacity: 0.3 }), []);
  const matBridge = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.1, emissive: "#ffffff", emissiveIntensity: 0.2 }), []);

  return (
    <group ref={groupRef} rotation={[0.3, 0, 0.2]} scale={0.7}>
      {pairs.map((p, i) => (
        <group key={i}>
          <mesh geometry={sphereGeo} material={matLeft} position={[p.x1, p.y, p.z1]} />
          <mesh geometry={sphereGeo} material={matRight} position={[p.x2, p.y, p.z2]} />
          <mesh geometry={cylGeo} material={matBridge} position={[0, p.y, 0]} rotation={[0, -p.angle, Math.PI / 2]} />
        </group>
      ))}
      <pointLight color="#10b981" intensity={2} distance={10} />
    </group>
  );
});

// Highly optimized InstancedMesh Particles (1 draw call instead of 150)
const Particles = memo(function Particles() {
  const count = 150;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const particles = useMemo(() => {
    return Array.from({ length: count }).map(() => ({
      x: (Math.random() - 0.5) * 50,
      y: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 20 - 5,
      speed: 0.2 + Math.random() * 0.5,
      offset: Math.random() * Math.PI * 2
    }));
  }, [count]);

  const colorArray = useMemo(() => {
    const colors = new Float32Array(count * 3);
    const color1 = new THREE.Color("#6366f1");
    const color2 = new THREE.Color("#a855f7");
    for (let i = 0; i < count; i++) {
      const c = Math.random() > 0.5 ? color1 : color2;
      c.toArray(colors, i * 3);
    }
    return colors;
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    particles.forEach((particle, i) => {
      const time = state.clock.elapsedTime * particle.speed + particle.offset;
      dummy.position.set(
        particle.x,
        particle.y + Math.sin(time) * 0.5,
        particle.z + Math.cos(time) * 0.5
      );
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.05, 8, 8]}>
        <instancedBufferAttribute attach="attributes-color" args={[colorArray, 3]} />
      </sphereGeometry>
      <meshStandardMaterial vertexColors emissive="#7c3aed" emissiveIntensity={3} />
    </instancedMesh>
  );
});

const Hero3D = () => {
  return (
    <div className="absolute inset-0 z-0 w-full h-full opacity-60 pointer-events-none">
      <Canvas 
        camera={{ position: [0, 0, 15], fov: 45 }} 
        dpr={[1, 1.5]} // Limit pixel ratio to 1.5x on retina displays to save huge fillrate
        performance={{ min: 0.5 }} // Allow R3F to scale down resolution if frame rate drops
        gl={{ powerPreference: "high-performance", antialias: false }} // Optimize WebGL context
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
        <spotLight position={[-10, -10, -5]} intensity={3} color="#6366f1" />
        
        <DNAHelix />
        <Particles />
        
        <EffectComposer disableNormalPass>
          <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={0.4} />
        </EffectComposer>

        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          autoRotate 
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2 + 0.2}
          minPolarAngle={Math.PI / 2 - 0.2}
        />
      </Canvas>
    </div>
  );
};

export default memo(Hero3D);
