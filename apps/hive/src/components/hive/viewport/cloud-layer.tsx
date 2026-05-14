'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { getWeatherCloudCount } from '@/engine/environment';
import { timeThemePresets } from '@/engine/time-themes';
import type { HiveTimeTheme, HiveWeather } from '@/engine/types';

const CLOUDS = [
  { scale: 1.2, speed: 0.08, x: -6, y: 5.8, z: -5 },
  { scale: 0.9, speed: 0.11, x: 2, y: 6.4, z: -7 },
  { scale: 1.05, speed: 0.06, x: 7, y: 5.6, z: 1 },
  { scale: 0.78, speed: 0.09, x: -1, y: 6.8, z: 5 },
  { scale: 1.34, speed: 0.05, x: 10, y: 6.1, z: -4 },
  { scale: 0.84, speed: 0.12, x: -10, y: 5.9, z: 2 },
  { scale: 1.12, speed: 0.07, x: 5, y: 7.1, z: 7 },
];

export function CloudLayer({
  timeTheme,
  weather,
}: {
  timeTheme: HiveTimeTheme;
  weather: HiveWeather;
}) {
  const groupRef = useRef<Group>(null);
  const clouds = useMemo(
    () => CLOUDS.slice(0, getWeatherCloudCount(weather)),
    [weather]
  );
  const cloudColor = timeThemePresets[timeTheme].cloud;
  const secondaryColor =
    weather === 'storm'
      ? '#586474'
      : timeTheme === 'midnight'
        ? '#1a253b'
        : '#eef4f3';
  const cloudOpacity =
    weather === 'storm' ? 0.64 : timeTheme === 'midnight' ? 0.28 : 0.82;

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
              color={weather === 'storm' ? '#6e7885' : cloudColor}
              opacity={cloudOpacity}
              roughness={0.9}
              transparent
            />
          </mesh>
          <mesh position={[-0.5, -0.05, 0.08]}>
            <boxGeometry args={[0.86, 0.32, 0.48]} />
            <meshStandardMaterial
              color={secondaryColor}
              opacity={
                weather === 'storm'
                  ? 0.56
                  : timeTheme === 'midnight'
                    ? 0.22
                    : 0.78
              }
              roughness={0.9}
              transparent
            />
          </mesh>
          <mesh position={[0.5, -0.04, -0.05]}>
            <boxGeometry args={[0.78, 0.3, 0.44]} />
            <meshStandardMaterial
              color={secondaryColor}
              opacity={
                weather === 'storm'
                  ? 0.52
                  : timeTheme === 'midnight'
                    ? 0.2
                    : 0.76
              }
              roughness={0.9}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
