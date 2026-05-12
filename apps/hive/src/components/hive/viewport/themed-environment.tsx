'use client';

import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  type AmbientLight,
  Color,
  type DirectionalLight,
  Fog,
  Vector3,
} from 'three';
import { timeThemePresets } from '@/engine/time-themes';
import type { HiveTimeTheme } from '@/engine/types';

export function ThemedEnvironment({ timeTheme }: { timeTheme: HiveTimeTheme }) {
  const ambientRef = useRef<AmbientLight>(null);
  const directionalRef = useRef<DirectionalLight>(null);
  const target = timeThemePresets[timeTheme];
  const { scene } = useThree();
  const stateRef = useRef({
    ambient: target.ambientIntensity,
    background: new Color(target.background),
    directional: target.directionalIntensity,
    fogFar: target.fogFar,
    fogNear: target.fogNear,
    lightPosition: new Vector3(...target.sunPosition),
    tint: new Color(target.tint),
  });
  const targetRef = useRef(target);
  const fog = useMemo(
    () => new Fog(target.background, target.fogNear, target.fogFar),
    [target.background, target.fogFar, target.fogNear]
  );

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [fog, scene]);

  useFrame(() => {
    const next = targetRef.current;
    const state = stateRef.current;
    state.background.lerp(new Color(next.background), 0.045);
    state.tint.lerp(new Color(next.tint), 0.045);
    state.lightPosition.lerp(new Vector3(...next.sunPosition), 0.045);
    state.ambient += (next.ambientIntensity - state.ambient) * 0.045;
    state.directional +=
      (next.directionalIntensity - state.directional) * 0.045;
    state.fogNear += (next.fogNear - state.fogNear) * 0.045;
    state.fogFar += (next.fogFar - state.fogFar) * 0.045;

    scene.background = state.background;
    fog.color.copy(state.background);
    fog.near = state.fogNear;
    fog.far = state.fogFar;
    if (ambientRef.current) {
      ambientRef.current.color.copy(state.tint);
      ambientRef.current.intensity = state.ambient;
    }
    if (directionalRef.current) {
      directionalRef.current.color.copy(state.tint);
      directionalRef.current.intensity = state.directional;
      directionalRef.current.position.copy(state.lightPosition);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <directionalLight
        castShadow
        ref={directionalRef}
        shadow-bias={-0.00008}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
        shadow-normalBias={0.035}
      />
      <SceneBackdrop timeTheme={timeTheme} />
    </>
  );
}

function SceneBackdrop({ timeTheme }: { timeTheme: HiveTimeTheme }) {
  if (timeTheme === 'midnight') {
    return (
      <>
        <Stars
          count={1400}
          depth={48}
          factor={3.8}
          fade
          radius={72}
          saturation={0.35}
          speed={0.35}
        />
        <mesh position={[0, 16, -28]} rotation={[0.2, 0, 0]}>
          <sphereGeometry args={[9, 24, 12]} />
          <meshBasicMaterial color="#d9e3ff" transparent opacity={0.13} />
        </mesh>
      </>
    );
  }

  if (timeTheme === 'evening') {
    return (
      <>
        <mesh position={[-12, 8, -22]}>
          <sphereGeometry args={[5.6, 24, 12]} />
          <meshBasicMaterial color="#f0a67d" transparent opacity={0.38} />
        </mesh>
        <mesh position={[10, 11, -26]}>
          <boxGeometry args={[24, 1.2, 0.4]} />
          <meshBasicMaterial color="#5f4a56" transparent opacity={0.24} />
        </mesh>
      </>
    );
  }

  if (timeTheme === 'afternoon') {
    return (
      <>
        <mesh position={[12, 12, -24]}>
          <sphereGeometry args={[4.6, 24, 12]} />
          <meshBasicMaterial color="#f2d69a" transparent opacity={0.44} />
        </mesh>
        <mesh position={[-10, 9, -26]}>
          <boxGeometry args={[20, 1.1, 0.4]} />
          <meshBasicMaterial color="#f7dfb8" transparent opacity={0.18} />
        </mesh>
      </>
    );
  }

  if (timeTheme === 'noon') {
    return (
      <>
        <mesh position={[0, 15, -26]}>
          <sphereGeometry args={[3.8, 24, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.34} />
        </mesh>
        <mesh position={[0, 9, -30]}>
          <boxGeometry args={[34, 1.5, 0.4]} />
          <meshBasicMaterial color="#d7f4f8" transparent opacity={0.22} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <mesh position={[-8, 11, -24]}>
        <sphereGeometry args={[4.4, 24, 12]} />
        <meshBasicMaterial color="#f4e7b2" transparent opacity={0.42} />
      </mesh>
      <mesh position={[8, 8, -26]}>
        <boxGeometry args={[22, 1.1, 0.4]} />
        <meshBasicMaterial color="#dff3ed" transparent opacity={0.2} />
      </mesh>
    </>
  );
}
