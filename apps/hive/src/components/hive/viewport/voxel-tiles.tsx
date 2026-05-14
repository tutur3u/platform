'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Color, type InstancedMesh, Object3D } from 'three';
import {
  getTerrainColor,
  getTerrainHeight,
  getTerrainSideColor,
} from '@/engine/catalog';
import type { HiveBlock, HiveSelection, HiveTool } from '@/engine/types';

type VoxelTilesProps = {
  blocks: HiveBlock[];
  gaplessMode: boolean;
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  tool: HiveTool;
};

export function VoxelTiles({
  blocks,
  gaplessMode,
  onErase,
  onSelect,
  selectedId,
  tool,
}: VoxelTilesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const sideRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current || !sideRef.current) return;
    const tileSize = gaplessMode ? 1 : 0.94;

    blocks.forEach((block, index) => {
      const height = getTerrainHeight(block.type);
      dummy.position.set(
        block.position.x,
        block.position.y + height / 2,
        block.position.z
      );
      dummy.scale.set(
        tileSize,
        selectedId === block.id ? height + 0.06 : height,
        tileSize
      );
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(
        index,
        new Color(getTerrainColor(block.type))
      );

      dummy.position.set(
        block.position.x,
        block.position.y - 0.21,
        block.position.z
      );
      dummy.scale.set(tileSize, 0.42, tileSize);
      dummy.updateMatrix();
      sideRef.current?.setMatrixAt(index, dummy.matrix);
      sideRef.current?.setColorAt(
        index,
        new Color(getTerrainSideColor(block.type))
      );
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    sideRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
    if (sideRef.current.instanceColor)
      sideRef.current.instanceColor.needsUpdate = true;
  }, [blocks, dummy, gaplessMode, selectedId]);

  return (
    <>
      <instancedMesh
        args={[undefined, undefined, blocks.length]}
        onClick={(event) => {
          event.stopPropagation();
          const block = blocks[event.instanceId ?? -1];
          if (!block) return;
          if (tool === 'erase') {
            onErase({ id: block.id, kind: 'block' });
            return;
          }

          onSelect(block.id);
        }}
        ref={meshRef}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.68} metalness={0.04} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, blocks.length]}
        ref={sideRef}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}
