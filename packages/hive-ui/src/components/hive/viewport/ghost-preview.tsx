'use client';

import { useMemo } from 'react';
import { Vector3 } from 'three';
import {
  getTerrainColor,
  getTerrainHeight,
  getTerrainSideColor,
} from '../../../engine/catalog';
import type {
  HiveBuildMode,
  HiveTool,
  HiveVector3,
} from '../../../engine/types';
import { ObjectGhostPreview } from './object-ghost-preview';

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
  const tileSize = gaplessMode ? 1 : 0.985;
  const position = useMemo(
    () =>
      hoverPosition
        ? new Vector3(
            hoverPosition.x,
            activeBuildMode === 'terrain'
              ? hoverPosition.y + getTerrainHeight(activeTerrain) / 2
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
      <TerrainGhostPreview
        activeTerrain={activeTerrain}
        position={position}
        tileSize={tileSize}
      />
    );
  }

  if (activeBuildMode === 'npc') {
    return <NpcGhostPreview position={position} />;
  }

  return <ObjectGhostPreview activeObject={activeObject} position={position} />;
}

function TerrainGhostPreview({
  activeTerrain,
  position,
  tileSize,
}: {
  activeTerrain: string;
  position: Vector3;
  tileSize: number;
}) {
  const height = getTerrainHeight(activeTerrain);

  return (
    <group name={`${activeTerrain}-preview`}>
      <mesh position={position}>
        <boxGeometry args={[tileSize, height, tileSize]} />
        <meshStandardMaterial
          color={getTerrainColor(activeTerrain)}
          opacity={0.62}
          transparent
        />
      </mesh>
      <mesh position={[position.x, position.y - height / 2 - 0.21, position.z]}>
        <boxGeometry args={[tileSize, 0.42, tileSize]} />
        <meshStandardMaterial
          color={getTerrainSideColor(activeTerrain)}
          opacity={0.42}
          transparent
        />
      </mesh>
    </group>
  );
}

function NpcGhostPreview({ position }: { position: Vector3 }) {
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
