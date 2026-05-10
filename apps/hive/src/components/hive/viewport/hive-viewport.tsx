'use client';

import { OrbitControls, PerspectiveCamera, Sky } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { Vector3 } from 'three';
import type {
  HiveNpc,
  HiveSelection,
  HiveTool,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import { snapVector } from '@/engine/world';
import { NpcPrefab, ObjectPrefab } from './object-prefabs';
import { VoxelTiles } from './voxel-tiles';

type HiveViewportProps = {
  activeObject: string;
  activeTerrain: string;
  npcs: HiveNpc[];
  onPlaceNpc: (position: HiveVector3) => void;
  onPlaceObject: (position: HiveVector3) => void;
  onPlaceTerrain: (position: HiveVector3) => void;
  onSelect: (selection: HiveSelection) => void;
  selection: HiveSelection;
  tool: HiveTool;
  world: HiveWorldData;
};

function PlacementPlane({
  onPlaceNpc,
  onPlaceObject,
  onPlaceTerrain,
  tool,
}: Pick<
  HiveViewportProps,
  'onPlaceNpc' | 'onPlaceObject' | 'onPlaceTerrain' | 'tool'
>) {
  return (
    <mesh
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

function GhostPreview({
  activeObject,
  activeTerrain,
  tool,
}: Pick<HiveViewportProps, 'activeObject' | 'activeTerrain' | 'tool'>) {
  const color = tool === 'terrain' ? '#8fbf4f' : '#d8a56a';
  const position = useMemo(
    () => new Vector3(0, tool === 'terrain' ? 0.35 : 1.2, 0),
    [tool]
  );

  if (tool !== 'terrain' && tool !== 'object') return null;

  return (
    <mesh
      name={tool === 'terrain' ? activeTerrain : activeObject}
      position={position}
    >
      <boxGeometry
        args={tool === 'terrain' ? [0.92, 0.18, 0.92] : [0.8, 0.8, 0.8]}
      />
      <meshStandardMaterial color={color} opacity={0.42} transparent />
      <GhostAnchor position={[0, 0.72, 0]} />
    </mesh>
  );
}

function GhostAnchor({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[0.02, 0.02, 0.02]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0} />
    </mesh>
  );
}

export function HiveViewport(props: HiveViewportProps) {
  return (
    <div className="relative h-full min-h-[560px] overflow-hidden bg-zinc-950">
      <Canvas
        shadows
        camera={{ fov: 45, position: [7, 8, 8] }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault fov={45} position={[7, 8, 8]} />
          <ambientLight intensity={0.85} />
          <directionalLight castShadow intensity={1.8} position={[6, 9, 4]} />
          <Sky
            distance={450000}
            inclination={0.53}
            sunPosition={[3, 8, 3]}
            turbidity={4}
          />
          <group rotation={[0, -Math.PI / 5, 0]}>
            <VoxelTiles
              blocks={props.world.blocks}
              onSelect={(id) => props.onSelect({ id, kind: 'block' })}
              selectedId={
                props.selection?.kind === 'block' ? props.selection.id : null
              }
            />
            {props.world.objects.map((object) => (
              <ObjectPrefab
                key={object.id}
                object={object}
                onSelect={(id) => props.onSelect({ id, kind: 'object' })}
                selected={
                  props.selection?.kind === 'object' &&
                  props.selection.id === object.id
                }
              />
            ))}
            {props.npcs.map((npc) => (
              <NpcPrefab
                key={npc.id}
                npc={npc}
                onSelect={(id) => props.onSelect({ id, kind: 'npc' })}
                selected={
                  props.selection?.kind === 'npc' &&
                  props.selection.id === npc.id
                }
              />
            ))}
            <PlacementPlane
              onPlaceNpc={props.onPlaceNpc}
              onPlaceObject={props.onPlaceObject}
              onPlaceTerrain={props.onPlaceTerrain}
              tool={props.tool}
            />
            <GhostPreview
              activeObject={props.activeObject}
              activeTerrain={props.activeTerrain}
              tool={props.tool}
            />
          </group>
          <OrbitControls
            enableDamping
            enablePan
            enableZoom
            maxDistance={24}
            maxPolarAngle={Math.PI / 2.08}
            minDistance={4}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
      <div className="pointer-events-none absolute top-4 left-4 rounded border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-300 backdrop-blur">
        {props.tool.toUpperCase()} / {props.activeTerrain} /{' '}
        {props.activeObject}
      </div>
    </div>
  );
}
