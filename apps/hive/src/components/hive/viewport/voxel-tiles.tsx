'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type InstancedMesh, Object3D } from 'three';
import { getTerrainColor, getTerrainSideColor } from '@/engine/catalog';
import type { HiveBlock, HiveSelection, HiveTool } from '@/engine/types';

type VoxelTilesProps = {
  blocks: HiveBlock[];
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  tool: HiveTool;
};

export function VoxelTiles({
  blocks,
  onErase,
  onSelect,
  selectedId,
  tool,
}: VoxelTilesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const edgeRef = useRef<InstancedMesh>(null);
  const sideRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    if (!meshRef.current || !edgeRef.current || !sideRef.current) return;

    blocks.forEach((block, index) => {
      dummy.position.set(
        block.position.x,
        block.position.y + 0.02,
        block.position.z
      );
      dummy.scale.set(0.96, selectedId === block.id ? 0.24 : 0.18, 0.96);
      dummy.updateMatrix();
      meshRef.current?.setMatrixAt(index, dummy.matrix);
      meshRef.current?.setColorAt(
        index,
        new Color(getTerrainColor(block.type))
      );

      dummy.position.set(
        block.position.x,
        block.position.y - 0.28,
        block.position.z
      );
      dummy.scale.set(0.96, 0.42, 0.96);
      dummy.updateMatrix();
      sideRef.current?.setMatrixAt(index, dummy.matrix);
      sideRef.current?.setColorAt(
        index,
        new Color(getTerrainSideColor(block.type))
      );

      dummy.position.set(
        block.position.x,
        block.position.y - 0.03,
        block.position.z
      );
      dummy.scale.set(0.98, 0.08, 0.98);
      dummy.updateMatrix();
      edgeRef.current?.setMatrixAt(index, dummy.matrix);
      edgeRef.current?.setColorAt(index, new Color('#52602f'));
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
    edgeRef.current.instanceMatrix.needsUpdate = true;
    sideRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor)
      meshRef.current.instanceColor.needsUpdate = true;
    if (edgeRef.current.instanceColor)
      edgeRef.current.instanceColor.needsUpdate = true;
    if (sideRef.current.instanceColor)
      sideRef.current.instanceColor.needsUpdate = true;
  }, [blocks, dummy, selectedId]);

  useFrame(({ clock }) => {
    const material = meshRef.current?.material;
    if (!material || Array.isArray(material)) return;
    material.opacity = 0.94 + Math.sin(clock.elapsedTime * 1.4) * 0.035;
  });

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
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.72} transparent />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, blocks.length]} ref={sideRef}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.84} />
      </instancedMesh>
      <instancedMesh args={[undefined, undefined, blocks.length]} ref={edgeRef}>
        <boxGeometry args={[1.02, 0.08, 1.02]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </>
  );
}
