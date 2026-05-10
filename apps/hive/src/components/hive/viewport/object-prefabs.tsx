'use client';

import type { ThreeEvent } from '@react-three/fiber';
import type { HiveNpc, HiveObject } from '@/engine/types';

type PrefabProps = {
  object: HiveObject;
  onSelect: (id: string) => void;
  selected: boolean;
};

function stopSelect(event: ThreeEvent<MouseEvent>, onSelect: () => void) {
  event.stopPropagation();
  onSelect();
}

export function ObjectPrefab({ object, onSelect, selected }: PrefabProps) {
  const common = {
    onClick: (event: ThreeEvent<MouseEvent>) =>
      stopSelect(event, () => onSelect(object.id)),
    position: [
      object.position.x,
      object.position.y,
      object.position.z,
    ] as const,
  };
  const ringColor = selected ? '#e2c168' : '#47503a';

  if (object.type === 'house') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.38, 0]}>
          <boxGeometry args={[1.4, 0.78, 1.25]} />
          <meshStandardMaterial color="#d8a56a" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0, 0.96, 0]} rotation={[0, Math.PI / 4, 0]}>
          <boxGeometry args={[1.25, 0.42, 1.25]} />
          <meshStandardMaterial color="#4d8ed8" roughness={0.62} />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[1.58, 0.1, 1.42]} />
          <meshStandardMaterial color={ringColor} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'tree') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.38, 0]}>
          <boxGeometry args={[0.28, 0.78, 0.28]} />
          <meshStandardMaterial color="#8a5a35" roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, 0.92, 0]}>
          <boxGeometry args={[0.92, 0.58, 0.92]} />
          <meshStandardMaterial color="#7fa94d" roughness={0.68} />
        </mesh>
        <mesh castShadow position={[0, 1.28, 0]}>
          <boxGeometry args={[0.66, 0.36, 0.66]} />
          <meshStandardMaterial color="#a4c968" roughness={0.7} />
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
          color={object.type === 'fence' ? '#b97b46' : '#6ea94d'}
          roughness={0.75}
        />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.86, 0.08, 0.86]} />
        <meshStandardMaterial color={ringColor} />
      </mesh>
    </group>
  );
}

export function NpcPrefab({
  npc,
  onSelect,
  selected,
}: {
  npc: HiveNpc;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const color = selected ? '#e2c168' : '#c89b45';

  return (
    <group
      onClick={(event) => stopSelect(event, () => onSelect(npc.id))}
      position={[npc.position.x, npc.position.y, npc.position.z]}
    >
      <mesh castShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.46, 0.68, 0.46]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
      <mesh castShadow position={[0, 0.82, 0]}>
        <boxGeometry args={[0.38, 0.32, 0.38]} />
        <meshStandardMaterial color="#d6b178" roughness={0.74} />
      </mesh>
    </group>
  );
}
