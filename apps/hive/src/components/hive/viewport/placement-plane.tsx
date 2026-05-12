'use client';

import type { ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import type { HiveSelection, HiveTool, HiveVector3 } from '@/engine/types';
import { snapVector } from '@/engine/world';

type PlacementPlaneProps = {
  onCommitPosition: (position: HiveVector3) => void;
  onHoverPosition: (position: HiveVector3 | null) => void;
  onSelect: (selection: HiveSelection) => void;
  tool: HiveTool;
  resolveBlockId: (position: HiveVector3) => string | null;
};

export function PlacementPlane({
  onCommitPosition,
  onHoverPosition,
  onSelect,
  resolveBlockId,
  tool,
}: PlacementPlaneProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const canEdit = tool === 'build' || tool === 'move' || tool === 'select';

  const commitAtPoint = (
    event: ThreeEvent<PointerEvent>,
    position: HiveVector3
  ) => {
    if (tool === 'select') {
      const blockId = resolveBlockId(position);
      onSelect(blockId ? { id: blockId, kind: 'block' } : null);
      return;
    }

    if (tool === 'build' || tool === 'move') {
      event.stopPropagation();
      onCommitPosition(position);
    }
  };

  return (
    <mesh
      onPointerLeave={() => onHoverPosition(null)}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (!canEdit) return;

        onHoverPosition(snapVector(event.point));
      }}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        if (!canEdit || event.button !== 0) return;
        const start = pointerStart.current;
        pointerStart.current = null;
        const moved = start
          ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
          : 0;
        if (moved > 5) return;
        commitAtPoint(event, snapVector(event.point));
      }}
      position={[0, 0.34, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[48, 48]} />
      <meshBasicMaterial color="#eef2e4" transparent opacity={0.01} />
    </mesh>
  );
}
