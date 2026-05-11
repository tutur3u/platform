'use client';

import type { ThreeEvent } from '@react-three/fiber';
import type { HiveTool, HiveVector3 } from '@/engine/types';
import { snapVector } from '@/engine/world';

type PlacementPlaneProps = {
  onHoverPosition: (position: HiveVector3 | null) => void;
  onPlaceNpc: (position: HiveVector3) => void;
  onPlaceObject: (position: HiveVector3) => void;
  onPlaceTerrain: (position: HiveVector3) => void;
  tool: HiveTool;
};

export function PlacementPlane({
  onHoverPosition,
  onPlaceNpc,
  onPlaceObject,
  onPlaceTerrain,
  tool,
}: PlacementPlaneProps) {
  return (
    <mesh
      onPointerLeave={() => onHoverPosition(null)}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (
          tool !== 'terrain' &&
          tool !== 'object' &&
          tool !== 'npc' &&
          tool !== 'erase'
        ) {
          return;
        }

        onHoverPosition(snapVector(event.point));
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (tool !== 'terrain' && tool !== 'object' && tool !== 'npc') return;
        event.stopPropagation();
        const point = snapVector(event.point);
        if (tool === 'terrain') onPlaceTerrain({ ...point, y: 0 });
        if (tool === 'object') onPlaceObject({ ...point, y: 1 });
        if (tool === 'npc') onPlaceNpc({ ...point, y: 1 });
      }}
      position={[0, -0.51, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[48, 48]} />
      <meshBasicMaterial color="#eef2e4" transparent opacity={0.02} />
    </mesh>
  );
}
