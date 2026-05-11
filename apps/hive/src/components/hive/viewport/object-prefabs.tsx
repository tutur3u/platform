'use client';

import type { ThreeEvent } from '@react-three/fiber';
import type {
  HiveNpc,
  HiveObject,
  HiveSelection,
  HiveTool,
} from '@/engine/types';

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
    rotation: [0, ((object.rotation ?? 0) * Math.PI) / 180, 0] as const,
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

  if (object.type === 'rock') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.2, 0]} rotation={[0.15, 0.3, -0.1]}>
          <boxGeometry args={[0.72, 0.38, 0.56]} />
          <meshStandardMaterial color="#96988f" roughness={0.86} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'bridge') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.16, 0]}>
          <boxGeometry args={[1.12, 0.16, 0.76]} />
          <meshStandardMaterial color="#8a6338" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[-0.38, 0.34, 0]}>
          <boxGeometry args={[0.1, 0.28, 0.84]} />
          <meshStandardMaterial color="#b8894f" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0.38, 0.34, 0]}>
          <boxGeometry args={[0.1, 0.28, 0.84]} />
          <meshStandardMaterial color="#b8894f" roughness={0.78} />
        </mesh>
      </group>
    );
  }

  if (object.type === 'lamp' || object.type === 'marker') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.16, 0.82, 0.16]} />
          <meshStandardMaterial color="#6c5738" roughness={0.75} />
        </mesh>
        <mesh castShadow position={[0, 0.92, 0]}>
          <boxGeometry args={[0.38, 0.28, 0.38]} />
          <meshStandardMaterial
            color={object.type === 'lamp' ? '#e5c65a' : '#d2a84c'}
            emissive={object.type === 'lamp' ? '#8d6f1c' : '#000000'}
            emissiveIntensity={object.type === 'lamp' ? 0.25 : 0}
            roughness={0.66}
          />
        </mesh>
      </group>
    );
  }

  if (object.type === 'well' || object.type === 'npc-spawn') {
    return (
      <group {...common}>
        <mesh castShadow position={[0, 0.22, 0]}>
          <boxGeometry args={[0.78, 0.34, 0.78]} />
          <meshStandardMaterial
            color={object.type === 'well' ? '#9a7b54' : '#c89b45'}
            roughness={0.8}
          />
        </mesh>
        <mesh castShadow position={[0, 0.52, 0]}>
          <boxGeometry args={[0.52, 0.24, 0.52]} />
          <meshStandardMaterial
            color={object.type === 'well' ? '#6f6f68' : '#e2c168'}
            roughness={0.74}
          />
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
  onErase,
  onSelect,
  selected,
  tool,
}: {
  npc: HiveNpc;
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onSelect: (id: string) => void;
  selected: boolean;
  tool: HiveTool;
}) {
  const color = selected ? '#e2c168' : '#c89b45';

  return (
    <group
      onClick={(event) =>
        stopSelect(event, () => {
          if (tool === 'erase') {
            onErase({ id: npc.id, kind: 'npc' });
            return;
          }

          onSelect(npc.id);
        })
      }
      position={[npc.position.x, npc.position.y - 1, npc.position.z]}
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
