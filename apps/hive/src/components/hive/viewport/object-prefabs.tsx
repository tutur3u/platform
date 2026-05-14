'use client';

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { HiveObject, HiveSelection, HiveTool } from '@/engine/types';
import { BuildingPrefab } from './building-prefabs';

type PrefabProps = {
  object: HiveObject;
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onSelect: (id: string) => void;
  selected: boolean;
  tool: HiveTool;
};

function stopSelect(event: ThreeEvent<MouseEvent>, onSelect: () => void) {
  event.stopPropagation();
  onSelect();
}

export function ObjectPrefab({
  object,
  onErase,
  onSelect,
  selected,
  tool,
}: PrefabProps) {
  const groupRef = useRef<Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000;
    const pulse = selected
      ? 1 + Math.sin(elapsed * 4 + phase.current) * 0.018
      : 1;
    groupRef.current.scale.setScalar(pulse);
    if (object.type === 'crop' || object.type === 'sensor') {
      groupRef.current.position.y =
        object.position.y - 1 + Math.sin(elapsed * 2.2 + phase.current) * 0.018;
    }
  });

  const common = {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      stopSelect(event, () => {
        if (tool === 'erase') {
          onErase({ id: object.id, kind: 'object' });
          return;
        }

        onSelect(object.id);
      });
    },
    position: [
      object.position.x,
      object.position.y - 1,
      object.position.z,
    ] as const,
    ref: groupRef,
    rotation: [0, ((object.rotation ?? 0) * Math.PI) / 180, 0] as const,
  };
  const ringColor = selected ? '#e2c168' : '#47503a';
  const building = BuildingPrefab({ common, object, ringColor });

  if (building) return building;

  if (object.type === 'tree') {
    return (
      <group {...common}>
        {/* Trunk */}
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.25, 0.8, 0.25]} />
          <meshStandardMaterial color="#694b37" roughness={0.9} />
        </mesh>
        {/* Lower foliage */}
        <mesh castShadow position={[0, 0.9, 0]}>
          <boxGeometry args={[1.0, 0.6, 1.0]} />
          <meshStandardMaterial color="#4a7c29" roughness={0.8} />
        </mesh>
        {/* Middle foliage */}
        <mesh castShadow position={[0, 1.35, 0]}>
          <boxGeometry args={[0.7, 0.5, 0.7]} />
          <meshStandardMaterial color="#5c9a32" roughness={0.8} />
        </mesh>
        {/* Top foliage */}
        <mesh castShadow position={[0, 1.7, 0]}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#6eba3d" roughness={0.8} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'rock') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.25, 0]} rotation={[0.1, 0.4, -0.1]}>
          <boxGeometry args={[0.8, 0.5, 0.6]} />
          <meshStandardMaterial color="#888c8d" roughness={0.9} />
        </mesh>
        <mesh
          castShadow
          position={[0.3, 0.15, 0.2]}
          rotation={[-0.2, 0.1, 0.2]}
        >
          <boxGeometry args={[0.4, 0.3, 0.5]} />
          <meshStandardMaterial color="#7a7d7e" roughness={0.9} />
        </mesh>
        <mesh
          castShadow
          position={[-0.2, 0.2, -0.2]}
          rotation={[0.3, -0.2, 0.1]}
        >
          <boxGeometry args={[0.5, 0.4, 0.4]} />
          <meshStandardMaterial color="#6a6d6e" roughness={0.9} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'bridge') {
    return (
      <group {...common}>
        {/* Main bridge deck */}
        <mesh castShadow position={[0, 0.15, 0]}>
          <boxGeometry args={[1.2, 0.1, 0.8]} />
          <meshStandardMaterial color="#8a6338" roughness={0.9} />
        </mesh>
        {/* Left rail */}
        <mesh castShadow position={[-0.4, 0.35, 0]}>
          <boxGeometry args={[0.08, 0.1, 0.8]} />
          <meshStandardMaterial color="#b8894f" roughness={0.8} />
        </mesh>
        {/* Right rail */}
        <mesh castShadow position={[0.4, 0.35, 0]}>
          <boxGeometry args={[0.08, 0.1, 0.8]} />
          <meshStandardMaterial color="#b8894f" roughness={0.8} />
        </mesh>
        {/* Rail posts left */}
        <mesh castShadow position={[-0.4, 0.25, -0.35]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#b8894f" />
        </mesh>
        <mesh castShadow position={[-0.4, 0.25, 0.35]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#b8894f" />
        </mesh>
        {/* Rail posts right */}
        <mesh castShadow position={[0.4, 0.25, -0.35]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#b8894f" />
        </mesh>
        <mesh castShadow position={[0.4, 0.25, 0.35]}>
          <boxGeometry args={[0.1, 0.2, 0.1]} />
          <meshStandardMaterial color="#b8894f" />
        </mesh>
      </group>
    );
  }

  if (object.type === 'lamp' || object.type === 'marker') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[0.12, 0.9, 0.12]} />
          <meshStandardMaterial color="#4a4235" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.95, 0]}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
          <meshStandardMaterial
            color={object.type === 'lamp' ? '#fff4d4' : '#d2a84c'}
            emissive={object.type === 'lamp' ? '#fac635' : '#000000'}
            emissiveIntensity={object.type === 'lamp' ? 0.8 : 0}
            roughness={0.2}
          />
        </mesh>
        {object.type === 'lamp' && (
          <mesh position={[0, 0.95, 0]}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#fac635" transparent opacity={0.15} />
          </mesh>
        )}
      </group>
    );
  }

  if (object.type === 'well' || object.type === 'npc-spawn') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.5, 0.5, 0.5, 8]} />
          <meshStandardMaterial
            color={object.type === 'well' ? '#787a7a' : '#c89b45'}
            roughness={0.9}
          />
        </mesh>
        {object.type === 'well' && (
          <>
            <mesh castShadow position={[-0.4, 0.6, 0]}>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color="#5a4231" />
            </mesh>
            <mesh castShadow position={[0.4, 0.6, 0]}>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color="#5a4231" />
            </mesh>
            <mesh castShadow position={[0, 1.05, 0]} rotation={[0, 0, 0]}>
              <boxGeometry args={[1.0, 0.1, 0.6]} />
              <meshStandardMaterial color="#6a4a3a" />
            </mesh>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.4, 0.4, 0.1, 8]} />
              <meshStandardMaterial color="#32637a" />
            </mesh>
          </>
        )}
      </group>
    );
  }

  if (object.type === 'sensor') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.34, 0]}>
          <boxGeometry args={[0.24, 0.68, 0.24]} />
          <meshStandardMaterial color="#5f7c8a" roughness={0.65} />
        </mesh>
        <mesh castShadow position={[0, 0.78, 0]}>
          <boxGeometry args={[0.44, 0.2, 0.44]} />
          <meshStandardMaterial color="#a8c8d1" roughness={0.48} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'crop' || object.type === 'flower-crop') {
    const growthStage =
      typeof object.state?.growthStage === 'number'
        ? Math.max(0.15, Math.min(1, object.state.growthStage))
        : 0.35;

    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.12 * growthStage, 0]}>
          <boxGeometry args={[0.62, 0.24 * growthStage, 0.62]} />
          <meshStandardMaterial
            color={object.type === 'flower-crop' ? '#bc6fc5' : '#6ea94d'}
            roughness={0.75}
          />
        </mesh>
        <mesh castShadow position={[-0.16, 0.24 * growthStage, 0.12]}>
          <boxGeometry args={[0.24, 0.22 * growthStage, 0.24]} />
          <meshStandardMaterial color="#9ccb62" roughness={0.75} />
        </mesh>
        <mesh castShadow position={[0.18, 0.28 * growthStage, -0.1]}>
          <boxGeometry args={[0.22, 0.24 * growthStage, 0.22]} />
          <meshStandardMaterial color="#8fbd4f" roughness={0.75} />
        </mesh>
      </group>
    );
  }

  return (
    <group {...common}>
      <mesh castShadow position={[0, 0.26, 0]}>
        <boxGeometry
          args={object.type === 'fence' ? [1.1, 0.52, 0.16] : [0.7, 0.24, 0.7]}
        />
        <meshStandardMaterial
          color={object.type === 'fence' ? '#aa7243' : '#6ea94d'}
          roughness={0.8}
        />
      </mesh>
      {object.type === 'fence' && (
        <mesh castShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[0.2, 0.6, 0.25]} />
          <meshStandardMaterial color="#8c5830" roughness={0.8} />
        </mesh>
      )}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.86, 0.08, 0.86]} />
        <meshStandardMaterial color={ringColor} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}
