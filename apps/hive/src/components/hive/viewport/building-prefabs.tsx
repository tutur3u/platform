'use client';

import type { ThreeElements } from '@react-three/fiber';
import type { ReactNode } from 'react';
import type { HiveObject } from '@/engine/types';

type BuildingPrefabProps = {
  common: ThreeElements['group'];
  object: HiveObject;
  ringColor: string;
};

export function BuildingPrefab({
  common,
  object,
  ringColor,
}: BuildingPrefabProps): ReactNode {
  if (object.type === 'house' || object.type === 'cottage') {
    const cottage = object.type === 'cottage';

    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.43, 0]}>
          <boxGeometry args={cottage ? [1.18, 0.82, 1.04] : [1.4, 0.9, 1.3]} />
          <meshStandardMaterial
            color={cottage ? '#efd8bc' : '#e5ccb3'}
            roughness={0.9}
          />
        </mesh>
        <mesh position={[0, 0.3, cottage ? 0.54 : 0.66]}>
          <boxGeometry args={[0.34, 0.58, 0.05]} />
          <meshStandardMaterial color="#6a4b3a" roughness={0.8} />
        </mesh>
        {[-0.38, 0.38].map((x) => (
          <mesh key={x} position={[x, 0.48, cottage ? 0.54 : 0.66]}>
            <boxGeometry args={[0.24, 0.25, 0.05]} />
            <meshStandardMaterial
              color="#88cbd8"
              emissive="#1a4d66"
              metalness={0.45}
              roughness={0.22}
            />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.02, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0, cottage ? 1.12 : 1.3, 0.68, 4]} />
          <meshStandardMaterial
            color={cottage ? '#4d8ed8' : '#c05a5a'}
            roughness={0.78}
          />
        </mesh>
        <mesh castShadow position={[-0.42, 1.2, -0.3]}>
          <boxGeometry args={[0.18, 0.5, 0.18]} />
          <meshStandardMaterial color="#8e4a4a" />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={cottage ? [1.38, 0.1, 1.22] : [1.6, 0.1, 1.5]} />
          <meshStandardMaterial color={ringColor} opacity={0.58} transparent />
        </mesh>
      </group>
    );
  }

  if (object.type === 'townhouse') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.72, 0]}>
          <boxGeometry args={[0.98, 1.42, 0.92]} />
          <meshStandardMaterial color="#d98a5b" roughness={0.82} />
        </mesh>
        {[0.35, 0.72, 1.08].map((y) =>
          [-0.26, 0.26].map((x) => (
            <mesh key={`${x}:${y}`} position={[x, y, 0.48]}>
              <boxGeometry args={[0.2, 0.18, 0.04]} />
              <meshStandardMaterial
                color="#9fd2e2"
                emissive="#173a4a"
                emissiveIntensity={0.12}
              />
            </mesh>
          ))
        )}
        <mesh position={[0, 1.48, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0, 0.86, 0.42, 4]} />
          <meshStandardMaterial color="#5b84c6" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.16, 0.1, 1.06]} />
          <meshStandardMaterial color={ringColor} opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  if (object.type === 'civic-hall') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.54, 0]}>
          <boxGeometry args={[1.62, 0.98, 1.18]} />
          <meshStandardMaterial color="#c96f62" roughness={0.78} />
        </mesh>
        {[-0.48, 0, 0.48].map((x) => (
          <mesh castShadow key={x} position={[x, 0.5, 0.64]}>
            <boxGeometry args={[0.14, 0.78, 0.14]} />
            <meshStandardMaterial color="#f2e6d6" roughness={0.6} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 1.16, 0]}>
          <boxGeometry args={[1.8, 0.24, 1.34]} />
          <meshStandardMaterial color="#6d7180" roughness={0.62} />
        </mesh>
        <mesh castShadow position={[0, 1.34, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0, 1.18, 0.42, 4]} />
          <meshStandardMaterial color="#494d5f" roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.95, 0.1, 1.48]} />
          <meshStandardMaterial color={ringColor} opacity={0.48} transparent />
        </mesh>
      </group>
    );
  }

  if (object.type === 'watchtower') {
    return (
      <group {...common}>
        {[-0.32, 0.32].flatMap((x) =>
          [-0.32, 0.32].map((z) => (
            <mesh castShadow key={`${x}:${z}`} position={[x, 0.62, z]}>
              <boxGeometry args={[0.12, 1.24, 0.12]} />
              <meshStandardMaterial color="#7a5737" roughness={0.82} />
            </mesh>
          ))
        )}
        <mesh castShadow position={[0, 1.22, 0]}>
          <boxGeometry args={[0.92, 0.38, 0.92]} />
          <meshStandardMaterial color="#8f84c7" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 1.62, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0, 0.72, 0.48, 4]} />
          <meshStandardMaterial color="#6559a8" roughness={0.66} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'greenhouse' || object.type === 'workshop') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.34, 0]}>
          <boxGeometry args={[1.18, 0.52, 1.02]} />
          <meshStandardMaterial
            color={object.type === 'greenhouse' ? '#7fb56a' : '#b76b55'}
            roughness={0.72}
          />
        </mesh>
        <mesh castShadow position={[0, 0.78, 0]}>
          <boxGeometry args={[1.02, 0.24, 0.86]} />
          <meshStandardMaterial
            color={object.type === 'greenhouse' ? '#b9d8a7' : '#6d7180'}
            opacity={object.type === 'greenhouse' ? 0.78 : 1}
            roughness={0.58}
            transparent={object.type === 'greenhouse'}
          />
        </mesh>
      </group>
    );
  }

  return null;
}
