'use client';

import { useMemo } from 'react';
import { Vector3 } from 'three';
import {
  getObjectCatalogItem,
  getTerrainColor,
  getTerrainHeight,
} from '@/engine/catalog';
import type { HiveBuildMode, HiveTool, HiveVector3 } from '@/engine/types';

type GhostPreviewProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  gaplessMode: boolean;
  hoverPosition: HiveVector3 | null;
  tool: HiveTool;
};

export function GhostPreview({
  activeBuildMode,
  activeObject,
  activeTerrain,
  gaplessMode,
  hoverPosition,
  tool,
}: GhostPreviewProps) {
  const tileSize = gaplessMode ? 1 : 0.94;
  const position = useMemo(
    () =>
      hoverPosition
        ? new Vector3(
            hoverPosition.x,
            activeBuildMode === 'terrain'
              ? getTerrainHeight(activeTerrain) / 2
              : 0,
            hoverPosition.z
          )
        : null,
    [activeBuildMode, activeTerrain, hoverPosition]
  );

  if (!position || tool !== 'build') {
    return null;
  }

  if (activeBuildMode === 'terrain') {
    return (
      <mesh name={activeTerrain} position={position}>
        <boxGeometry
          args={[tileSize, getTerrainHeight(activeTerrain), tileSize]}
        />
        <meshStandardMaterial
          color={getTerrainColor(activeTerrain)}
          opacity={0.56}
          transparent
        />
      </mesh>
    );
  }

  if (activeBuildMode === 'npc') {
    return (
      <group name="npc-preview" position={position}>
        <mesh position={[0, 0.34, 0]}>
          <boxGeometry args={[0.46, 0.68, 0.46]} />
          <meshStandardMaterial color="#c89b45" opacity={0.46} transparent />
        </mesh>
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[0.38, 0.32, 0.38]} />
          <meshStandardMaterial color="#d6b178" opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  return <ObjectGhostPreview activeObject={activeObject} position={position} />;
}

function ObjectGhostPreview({
  activeObject,
  position,
}: {
  activeObject: string;
  position: Vector3;
}) {
  const color = getObjectCatalogItem(activeObject)?.color ?? '#d8a56a';
  const material = (
    <meshStandardMaterial color={color} opacity={0.48} transparent />
  );

  if (
    activeObject === 'house' ||
    activeObject === 'cottage' ||
    activeObject === 'townhouse' ||
    activeObject === 'civic-hall' ||
    activeObject === 'watchtower'
  ) {
    const tall = activeObject === 'townhouse' || activeObject === 'watchtower';
    const wide = activeObject === 'civic-hall';

    return (
      <group name={`${activeObject}-preview`} position={position}>
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry
            args={[
              wide ? 1.62 : activeObject === 'cottage' ? 1.16 : 1.4,
              tall ? 1.28 : 0.78,
              wide ? 1.18 : activeObject === 'cottage' ? 1.02 : 1.25,
            ]}
          />
          <meshStandardMaterial color="#d8a56a" opacity={0.44} transparent />
        </mesh>
        <mesh
          position={[0, tall ? 1.36 : 0.96, 0]}
          rotation={[0, Math.PI / 4, 0]}
        >
          <boxGeometry args={[1.25, 0.42, 1.25]} />
          <meshStandardMaterial color="#4d8ed8" opacity={0.52} transparent />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[wide ? 1.9 : 1.58, 0.1, wide ? 1.42 : 1.42]} />
          <meshStandardMaterial color="#47503a" opacity={0.3} transparent />
        </mesh>
      </group>
    );
  }

  if (activeObject === 'tree') {
    return (
      <group name="tree-preview" position={position}>
        <mesh position={[0, 0.38, 0]}>
          <boxGeometry args={[0.28, 0.78, 0.28]} />
          <meshStandardMaterial color="#8a5a35" opacity={0.46} transparent />
        </mesh>
        <mesh position={[0, 0.92, 0]}>
          <boxGeometry args={[0.92, 0.58, 0.92]} />
          <meshStandardMaterial color="#7fa94d" opacity={0.5} transparent />
        </mesh>
        <mesh position={[0, 1.28, 0]}>
          <boxGeometry args={[0.66, 0.36, 0.66]} />
          <meshStandardMaterial color="#a4c968" opacity={0.5} transparent />
        </mesh>
      </group>
    );
  }

  if (activeObject === 'bridge') {
    return (
      <group name="bridge-preview" position={position}>
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[1.12, 0.16, 0.76]} />
          {material}
        </mesh>
        <mesh position={[-0.38, 0.34, 0]}>
          <boxGeometry args={[0.1, 0.28, 0.84]} />
          <meshStandardMaterial color="#b8894f" opacity={0.44} transparent />
        </mesh>
        <mesh position={[0.38, 0.34, 0]}>
          <boxGeometry args={[0.1, 0.28, 0.84]} />
          <meshStandardMaterial color="#b8894f" opacity={0.44} transparent />
        </mesh>
      </group>
    );
  }

  if (activeObject === 'lamp' || activeObject === 'marker') {
    return (
      <group name={`${activeObject}-preview`} position={position}>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[0.16, 0.82, 0.16]} />
          <meshStandardMaterial color="#6c5738" opacity={0.44} transparent />
        </mesh>
        <mesh position={[0, 0.92, 0]}>
          <boxGeometry args={[0.38, 0.28, 0.38]} />
          {material}
        </mesh>
      </group>
    );
  }

  if (activeObject === 'well' || activeObject === 'npc-spawn') {
    return (
      <group name={`${activeObject}-preview`} position={position}>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.78, 0.34, 0.78]} />
          {material}
        </mesh>
        <mesh position={[0, 0.52, 0]}>
          <boxGeometry args={[0.52, 0.24, 0.52]} />
          <meshStandardMaterial color="#e2c168" opacity={0.38} transparent />
        </mesh>
      </group>
    );
  }

  return (
    <group name={`${activeObject}-preview`} position={position}>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry
          args={activeObject === 'fence' ? [1.1, 0.52, 0.16] : [0.7, 0.24, 0.7]}
        />
        {material}
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.86, 0.08, 0.86]} />
        <meshStandardMaterial color="#47503a" opacity={0.24} transparent />
      </mesh>
    </group>
  );
}
