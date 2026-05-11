'use client';

import { useMemo } from 'react';
import { Vector3 } from 'three';
import type { HiveTool, HiveVector3 } from '@/engine/types';

type GhostPreviewProps = {
  activeObject: string;
  activeTerrain: string;
  hoverPosition: HiveVector3 | null;
  tool: HiveTool;
};

export function GhostPreview({
  activeObject,
  activeTerrain,
  hoverPosition,
  tool,
}: GhostPreviewProps) {
  const color =
    tool === 'terrain' ? '#8fbf4f' : tool === 'npc' ? '#d6b178' : '#d8a56a';
  const position = useMemo(
    () =>
      hoverPosition
        ? new Vector3(
            hoverPosition.x,
            tool === 'terrain' ? 0.12 : 0.42,
            hoverPosition.z
          )
        : null,
    [hoverPosition, tool]
  );

  if (
    !position ||
    (tool !== 'terrain' && tool !== 'object' && tool !== 'npc')
  ) {
    return null;
  }

  return (
    <mesh
      name={
        tool === 'terrain'
          ? activeTerrain
          : tool === 'npc'
            ? 'npc'
            : activeObject
      }
      position={position}
    >
      <boxGeometry
        args={tool === 'terrain' ? [0.92, 0.16, 0.92] : [0.72, 0.72, 0.72]}
      />
      <meshStandardMaterial color={color} opacity={0.42} transparent />
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[0.02, 0.02, 0.02]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} />
      </mesh>
    </mesh>
  );
}
