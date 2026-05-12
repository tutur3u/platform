'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { timeThemePresets } from '@/engine/time-themes';
import type { HiveTimeTheme } from '@/engine/types';

const CLOUDS = [
  { scale: 1.2, speed: 0.08, x: -6, y: 5.8, z: -5 },
  { scale: 0.9, speed: 0.11, x: 2, y: 6.4, z: -7 },
  { scale: 1.05, speed: 0.06, x: 7, y: 5.6, z: 1 },
];

export function CloudLayer({ timeTheme }: { timeTheme: HiveTimeTheme }) {
  const groupRef = useRef<Group>(null);
  const clouds = useMemo(() => CLOUDS, []);
  const cloudColor = timeThemePresets[timeTheme].cloud;
  const secondaryColor = timeTheme === 'midnight' ? '#1a253b' : '#eef4f3';

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000;
    groupRef.current.children.forEach((cloud, index) => {
      const seed = clouds[index] ?? clouds[0]!;
      cloud.position.x = seed.x + Math.sin(elapsed * seed.speed) * 2;
      cloud.position.z = seed.z + Math.cos(elapsed * seed.speed) * 1.2;
    });
  });

  return (
    <group ref={groupRef}>
      {clouds.map((cloud) => (
        <group
          key={`${cloud.x}:${cloud.z}`}
          position={[cloud.x, cloud.y, cloud.z]}
          scale={cloud.scale}
        >
          <mesh>
            <boxGeometry args={[1.4, 0.38, 0.52]} />
            <meshStandardMaterial
              color={cloudColor}
              opacity={timeTheme === 'midnight' ? 0.28 : 0.82}
              roughness={0.9}
              transparent
            />
          </mesh>
          <mesh position={[-0.5, -0.05, 0.08]}>
            <boxGeometry args={[0.86, 0.32, 0.48]} />
            <meshStandardMaterial
              color={secondaryColor}
              opacity={timeTheme === 'midnight' ? 0.22 : 0.78}
              roughness={0.9}
              transparent
            />
          </mesh>
          <mesh position={[0.5, -0.04, -0.05]}>
            <boxGeometry args={[0.78, 0.3, 0.44]} />
            <meshStandardMaterial
              color={secondaryColor}
              opacity={timeTheme === 'midnight' ? 0.2 : 0.76}
              roughness={0.9}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
