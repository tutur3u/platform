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
        {/* Base house wall */}
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[1.4, 0.9, 1.3]} />
          <meshStandardMaterial color="#e5ccb3" roughness={0.9} />
        </mesh>
        {/* Door */}
        <mesh position={[0, 0.3, 0.66]}>
          <boxGeometry args={[0.35, 0.6, 0.05]} />
          <meshStandardMaterial color="#6a4b3a" roughness={0.8} />
        </mesh>
        {/* Window */}
        <mesh position={[0.4, 0.45, 0.66]}>
          <boxGeometry args={[0.3, 0.3, 0.05]} />
          <meshStandardMaterial
            color="#88cbd8"
            emissive="#1a4d66"
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
        {/* Roof */}
        <mesh castShadow position={[0, 1.05, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0, 1.3, 0.7, 4]} />
          <meshStandardMaterial color="#c05a5a" roughness={0.8} />
        </mesh>
        {/* Chimney */}
        <mesh castShadow position={[-0.4, 1.2, -0.3]}>
          <boxGeometry args={[0.2, 0.6, 0.2]} />
          <meshStandardMaterial color="#8e4a4a" />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.6, 0.1, 1.5]} />
          <meshStandardMaterial color={ringColor} transparent opacity={0.6} />
        </mesh>
      </group>
    );
  }

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
      {/* Body */}
      <mesh castShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.7, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 0.85, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#ebcdab" roughness={0.6} />
      </mesh>
      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.45, 16]} />
          <meshBasicMaterial color="#e2c168" />
        </mesh>
      )}
    </group>
  );
}
