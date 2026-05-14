'use client';

import type { HiveObject } from '@/engine/types';
import { getObjectPrefabColors } from './object-prefab-colors';

type ObjectPrefabPartProps = {
  object: HiveObject;
};

export function TreePrefab({ object }: ObjectPrefabPartProps) {
  const { accentColor, primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[0.25, 0.8, 0.25]} />
        <meshStandardMaterial color="#694b37" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[0.9, 0.6, 0.9]} />
        <meshStandardMaterial color={primaryColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.7]} />
        <meshStandardMaterial color={accentColor} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color={accentColor} roughness={0.8} />
      </mesh>
    </>
  );
}

export function RockPrefab({ object }: ObjectPrefabPartProps) {
  const { accentColor, primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.25, 0]} rotation={[0.1, 0.4, -0.1]}>
        <boxGeometry args={[0.8, 0.5, 0.6]} />
        <meshStandardMaterial color={primaryColor} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.3, 0.15, 0.2]} rotation={[-0.2, 0.1, 0.2]}>
        <boxGeometry args={[0.4, 0.3, 0.5]} />
        <meshStandardMaterial color={accentColor} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[-0.2, 0.2, -0.2]} rotation={[0.3, -0.2, 0.1]}>
        <boxGeometry args={[0.5, 0.4, 0.4]} />
        <meshStandardMaterial color={accentColor} roughness={0.9} />
      </mesh>
    </>
  );
}

export function CropPrefab({ object }: ObjectPrefabPartProps) {
  const { primaryColor } = getObjectPrefabColors(object);
  const growthStage =
    typeof object.state?.growthStage === 'number'
      ? Math.max(0.15, Math.min(1, object.state.growthStage))
      : 0.35;

  return (
    <>
      <mesh castShadow position={[0, 0.12 * growthStage, 0]}>
        <boxGeometry args={[0.62, 0.24 * growthStage, 0.62]} />
        <meshStandardMaterial color={primaryColor} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[-0.16, 0.24 * growthStage, 0.12]}>
        <boxGeometry args={[0.24, 0.22 * growthStage, 0.24]} />
        <meshStandardMaterial color="#9ccb62" roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0.18, 0.28 * growthStage, -0.1]}>
        <boxGeometry args={[0.22, 0.24 * growthStage, 0.22]} />
        <meshStandardMaterial color="#8fbd4f" roughness={0.75} />
      </mesh>
    </>
  );
}
