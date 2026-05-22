'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import type { HiveWeather } from '../../../engine/types';

type WeatherLayerProps = {
  weather: HiveWeather;
};

const PRECIPITATION_COUNT = 64;

export function WeatherLayer({ weather }: WeatherLayerProps) {
  const groupRef = useRef<Group>(null);
  const drops = useMemo(
    () =>
      Array.from({ length: PRECIPITATION_COUNT }, (_, index) => ({
        delay: (index % 13) * 0.13,
        speed: 2.2 + (index % 7) * 0.18,
        x: -8 + (index % 16),
        y: 2.6 + ((index * 7) % 26) / 5,
        z: -7 + Math.floor(index / 4),
      })),
    []
  );

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000;
    groupRef.current.children.forEach((drop, index) => {
      const seed = drops[index] ?? drops[0]!;
      const fall = ((elapsed + seed.delay) * seed.speed) % 5.4;
      drop.position.set(seed.x, seed.y - fall, seed.z);
    });
  });

  if (weather === 'clear' || weather === 'cloudy') return null;

  if (weather === 'fog') {
    return (
      <group>
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[20, 1.3, 20]} />
          <meshBasicMaterial color="#e8efed" opacity={0.18} transparent />
        </mesh>
        <mesh position={[0, 3.2, -2]}>
          <boxGeometry args={[18, 1.1, 14]} />
          <meshBasicMaterial color="#f7fbfa" opacity={0.12} transparent />
        </mesh>
      </group>
    );
  }

  const snow = weather === 'snow';
  const storm = weather === 'storm';

  return (
    <group ref={groupRef}>
      {drops.map((drop, index) => (
        <mesh
          key={`${drop.x}:${drop.z}:${index}`}
          position={[drop.x, drop.y, drop.z]}
          rotation={[storm ? -0.35 : -0.14, 0, storm ? 0.2 : 0]}
        >
          <boxGeometry
            args={
              snow ? [0.08, 0.08, 0.08] : [0.025, storm ? 0.72 : 0.54, 0.025]
            }
          />
          <meshBasicMaterial
            color={snow ? '#ffffff' : storm ? '#d7e8ff' : '#a9d5f4'}
            opacity={snow ? 0.72 : storm ? 0.62 : 0.48}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
}
