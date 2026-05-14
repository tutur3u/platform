'use client';

import type { ThreeEvent } from '@react-three/fiber';
import { useRef } from 'react';
import type { HiveSelection, HiveTool, HiveVector3 } from '@/engine/types';
import { snapVector } from '@/engine/world';

type PlacementPlaneProps = {
  onCommitPosition: (position: HiveVector3) => void;
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onHoverPosition: (position: HiveVector3 | null) => void;
  onSelect: (selection: HiveSelection) => void;
  resolveBlockId: (position: HiveVector3) => string | null;
  tool: HiveTool;
};

type PlacementPlaneAction =
  | { kind: 'commit'; position: HiveVector3 }
  | { kind: 'erase'; selection: NonNullable<HiveSelection> | null }
  | { kind: 'none' }
  | { kind: 'select'; selection: HiveSelection };

export function resolvePlacementPlaneAction({
  position,
  resolveBlockId,
  tool,
}: {
  position: HiveVector3;
  resolveBlockId: (position: HiveVector3) => string | null;
  tool: HiveTool;
}): PlacementPlaneAction {
  if (tool === 'select') {
    const blockId = resolveBlockId(position);
    return {
      kind: 'select',
      selection: blockId ? { id: blockId, kind: 'block' } : null,
    };
  }

  if (tool === 'erase') {
    const blockId = resolveBlockId(position);
    return {
      kind: 'erase',
      selection: blockId ? { id: blockId, kind: 'block' } : null,
    };
  }

  if (tool === 'build' || tool === 'move') {
    return { kind: 'commit', position };
  }

  return { kind: 'none' };
}

export function PlacementPlane({
  onCommitPosition,
  onErase,
  onHoverPosition,
  onSelect,
  resolveBlockId,
  tool,
}: PlacementPlaneProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const canEdit =
    tool === 'build' ||
    tool === 'erase' ||
    tool === 'move' ||
    tool === 'select';

  const commitAtPoint = (
    event: ThreeEvent<PointerEvent>,
    position: HiveVector3
  ) => {
    const action = resolvePlacementPlaneAction({
      position,
      resolveBlockId,
      tool,
    });

    if (action.kind === 'select') {
      onSelect(action.selection);
      return;
    }

    if (action.kind === 'erase') {
      if (action.selection) {
        event.stopPropagation();
        onErase(action.selection);
      }
      return;
    }

    if (action.kind === 'commit') {
      event.stopPropagation();
      onCommitPosition(action.position);
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
        if (event.intersections[0]?.object !== event.object) {
          pointerStart.current = null;
          return;
        }
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
