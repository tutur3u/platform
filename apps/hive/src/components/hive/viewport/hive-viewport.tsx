'use client';

import {
  ContactShadows,
  OrbitControls,
  PerspectiveCamera,
  Sky,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import { MOUSE } from 'three';
import type {
  HiveNpc,
  HiveSelection,
  HiveTool,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import { GhostPreview } from './ghost-preview';
import { NpcPrefab, ObjectPrefab } from './object-prefabs';
import { PlacementPlane } from './placement-plane';
import { VoxelTiles } from './voxel-tiles';

type HiveViewportProps = {
  activeObject: string;
  activeTerrain: string;
  npcs: HiveNpc[];
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onMoveSelection: (position: HiveVector3) => void;
  onPlaceNpc: (position: HiveVector3) => void;
  onPlaceObject: (position: HiveVector3) => void;
  onPlaceTerrain: (position: HiveVector3) => void;
  onSelect: (selection: HiveSelection) => void;
  selection: HiveSelection;
  tool: HiveTool;
  world: HiveWorldData;
};

export function HiveViewport(props: HiveViewportProps) {
  const [hoverPosition, setHoverPosition] = useState<HiveVector3 | null>(null);
  const [spacePanning, setSpacePanning] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(true);
      if (event.key === 'Escape') props.onSelect(null);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePanning(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [props.onSelect]);

  const commitPosition = (position: HiveVector3) => {
    if (props.tool === 'terrain') props.onPlaceTerrain({ ...position, y: 0 });
    if (props.tool === 'object') props.onPlaceObject({ ...position, y: 1 });
    if (props.tool === 'npc') props.onPlaceNpc({ ...position, y: 1 });
    if (props.tool === 'move') props.onMoveSelection({ ...position, y: 1 });
  };

  const resolveBlockId = (position: HiveVector3) =>
    props.world.blocks.find(
      (block) =>
        block.position.x === position.x &&
        block.position.z === position.z &&
        block.position.y === 0
    )?.id ?? null;

  return (
    <div
      className="relative h-full min-h-[560px] overflow-hidden bg-[#edf3f2]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        shadows
        camera={{ fov: 44, position: [8, 7.5, 8] }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Suspense fallback={null}>
          <color args={['#edf3f2']} attach="background" />
          <fog args={['#edf3f2', 13, 24]} attach="fog" />
          <PerspectiveCamera makeDefault fov={44} position={[8, 7.5, 8]} />
          <ambientLight intensity={1.2} />
          <directionalLight
            castShadow
            intensity={1.9}
            position={[6, 10, 5]}
            shadow-mapSize-height={2048}
            shadow-mapSize-width={2048}
          />
          <Sky
            distance={450000}
            inclination={0.53}
            sunPosition={[3, 8, 3]}
            turbidity={4}
          />
          <group>
            <VoxelTiles
              blocks={props.world.blocks}
              onErase={props.onErase}
              onSelect={(id) => props.onSelect({ id, kind: 'block' })}
              selectedId={
                props.selection?.kind === 'block' ? props.selection.id : null
              }
              tool={props.tool}
            />
            {props.world.objects.map((object) => (
              <ObjectPrefab
                key={object.id}
                object={object}
                onErase={props.onErase}
                onSelect={(id) => props.onSelect({ id, kind: 'object' })}
                selected={
                  props.selection?.kind === 'object' &&
                  props.selection.id === object.id
                }
                tool={props.tool}
              />
            ))}
            {props.npcs.map((npc) => (
              <NpcPrefab
                key={npc.id}
                npc={npc}
                onErase={props.onErase}
                onSelect={(id) => props.onSelect({ id, kind: 'npc' })}
                selected={
                  props.selection?.kind === 'npc' &&
                  props.selection.id === npc.id
                }
                tool={props.tool}
              />
            ))}
            <PlacementPlane
              onCommitPosition={commitPosition}
              onErase={props.onErase}
              onHoverPosition={setHoverPosition}
              onSelect={props.onSelect}
              resolveBlockId={resolveBlockId}
              tool={props.tool}
            />
            <GhostPreview
              activeObject={props.activeObject}
              activeTerrain={props.activeTerrain}
              hoverPosition={hoverPosition}
              tool={props.tool}
            />
          </group>
          <ContactShadows
            blur={2.6}
            far={12}
            opacity={0.24}
            position={[0, -0.02, 0]}
            scale={18}
          />
          <OrbitControls
            enableDamping
            enablePan
            enableZoom
            mouseButtons={{
              LEFT: spacePanning ? MOUSE.PAN : MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            maxDistance={24}
            maxPolarAngle={Math.PI / 2.08}
            minDistance={4}
            screenSpacePanning
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
