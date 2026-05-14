'use client';

import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import {
  getObjectFootprint,
  getObjectFootprintCenter,
} from '@/engine/footprint';
import type { HiveObject, HiveSelection, HiveTool } from '@/engine/types';
import { BuildingPrefab } from './building-prefabs';
import { CropPrefab, RockPrefab, TreePrefab } from './object-nature-prefabs';
import { getObjectPrefabColors } from './object-prefab-colors';
import {
  BridgePrefab,
  LampMarkerPrefab,
  SensorPrefab,
  WellSpawnPrefab,
} from './object-utility-prefabs';

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
  const footprint = getObjectFootprint(object.type, object.state);
  const center = getObjectFootprintCenter(object);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() / 1000;
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
    position: [center.x, object.position.y - 1, center.z] as const,
    ref: groupRef,
    rotation: [0, ((object.rotation ?? 0) * Math.PI) / 180, 0] as const,
  };
  const ringColor = selected ? '#e2c168' : '#47503a';
  const building = BuildingPrefab({ common, footprint, object, ringColor });

  if (building) return building;

  return (
    <group {...common}>
      <ObjectPrefabBody
        footprint={footprint}
        object={object}
        ringColor={ringColor}
      />
    </group>
  );
}

export function ObjectPrefabBody({
  footprint,
  object,
  ringColor,
}: {
  footprint: ReturnType<typeof getObjectFootprint>;
  object: HiveObject;
  ringColor: string;
}) {
  if (object.type === 'tree') return <TreePrefab object={object} />;
  if (object.type === 'rock') return <RockPrefab object={object} />;
  if (object.type === 'bridge') {
    return <BridgePrefab footprint={footprint} object={object} />;
  }
  if (object.type === 'lamp' || object.type === 'marker') {
    return <LampMarkerPrefab footprint={footprint} object={object} />;
  }
  if (object.type === 'well' || object.type === 'npc-spawn') {
    return <WellSpawnPrefab footprint={footprint} object={object} />;
  }
  if (object.type === 'sensor') {
    return <SensorPrefab footprint={footprint} object={object} />;
  }
  if (object.type === 'crop' || object.type === 'flower-crop') {
    return <CropPrefab object={object} />;
  }

  const { primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.26, 0]}>
        <boxGeometry
          args={
            object.type === 'fence'
              ? [0.96, 0.52, 0.14]
              : [footprint.width * 0.72, 0.24, footprint.depth * 0.72]
          }
        />
        <meshStandardMaterial color={primaryColor} roughness={0.8} />
      </mesh>
      {object.type === 'fence' ? (
        <mesh castShadow position={[0, 0.26, 0]}>
          <boxGeometry args={[0.2, 0.6, 0.25]} />
          <meshStandardMaterial color="#8c5830" roughness={0.8} />
        </mesh>
      ) : null}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry
          args={[footprint.width * 0.96, 0.08, footprint.depth * 0.96]}
        />
        <meshStandardMaterial color={ringColor} transparent opacity={0.6} />
      </mesh>
    </>
  );
}
