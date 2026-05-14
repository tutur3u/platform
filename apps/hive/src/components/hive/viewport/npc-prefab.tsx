'use client';

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { getStyleColor } from '@/engine/style';
import type { HiveNpc, HiveSelection, HiveTool } from '@/engine/types';

type NpcPrefabProps = {
  npc: HiveNpc;
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onSelect: (id: string) => void;
  selected: boolean;
  tool: HiveTool;
};

export function NpcPrefab({
  npc,
  onErase,
  onSelect,
  selected,
  tool,
}: NpcPrefabProps) {
  const color = selected
    ? '#e2c168'
    : getStyleColor(npc.settings, 'color', '#c89b45');
  const headColor = getStyleColor(npc.settings, 'accentColor', '#ebcdab');
  const groupRef = useRef<Group>(null);
  const rotation =
    typeof npc.settings.rotation === 'number' ? npc.settings.rotation : 0;

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000;
    const bob = Math.sin(elapsed * 2.6 + npc.position.x) * 0.035;
    groupRef.current.position.y = npc.position.y - 1 + bob;
    groupRef.current.rotation.y =
      (rotation * Math.PI) / 180 +
      Math.sin(elapsed * 1.4 + npc.position.z) * 0.08;
  });

  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        if (tool === 'erase') {
          onErase({ id: npc.id, kind: 'npc' });
          return;
        }
        onSelect(npc.id);
      }}
      position={[npc.position.x, npc.position.y - 1, npc.position.z]}
      ref={groupRef}
    >
      <mesh castShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.7, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={headColor} roughness={0.6} />
      </mesh>
      {selected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.45, 16]} />
          <meshBasicMaterial color="#e2c168" />
        </mesh>
      )}
    </group>
  );
}
