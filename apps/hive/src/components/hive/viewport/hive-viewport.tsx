'use client';

import {
  ContactShadows,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MOUSE, PCFShadowMap, TOUCH } from 'three';
import { timeThemePresets } from '@/engine/time-themes';
import type {
  HiveBuildMode,
  HiveNpc,
  HiveSelection,
  HiveTimeTheme,
  HiveTool,
  HiveVector3,
  HiveWorldData,
} from '@/engine/types';
import { CloudLayer } from './cloud-layer';
import { GhostPreview } from './ghost-preview';
import { NpcPrefab } from './npc-prefab';
import { ObjectPrefab } from './object-prefabs';
import { PlacementPlane } from './placement-plane';
import { ThemedEnvironment } from './themed-environment';
import { VoxelTiles } from './voxel-tiles';

type HiveViewportProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  gaplessMode: boolean;
  npcs: HiveNpc[];
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onMoveSelection: (position: HiveVector3) => void;
  onPlaceNpc: (position: HiveVector3) => void;
  onPlaceObject: (position: HiveVector3) => void;
  onPlaceTerrain: (position: HiveVector3) => void;
  onSelect: (selection: HiveSelection) => void;
  selection: HiveSelection;
  timeTheme: HiveTimeTheme;
  tool: HiveTool;
  world: HiveWorldData;
};

export function HiveViewport(props: HiveViewportProps) {
  const [hoverPosition, setHoverPosition] = useState<HiveVector3 | null>(null);
  const theme = useMemo(
    () => timeThemePresets[props.timeTheme],
    [props.timeTheme]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onSelect(null);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [props.onSelect]);

  const commitPosition = (position: HiveVector3) => {
    if (props.tool === 'build' && props.activeBuildMode === 'terrain') {
      props.onPlaceTerrain({ ...position, y: 0 });
    }
    if (props.tool === 'build' && props.activeBuildMode === 'object') {
      props.onPlaceObject({ ...position, y: 1 });
    }
    if (props.tool === 'build' && props.activeBuildMode === 'npc') {
      props.onPlaceNpc({ ...position, y: 1 });
    }
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
      className="relative h-full min-h-[560px] overflow-hidden"
      onContextMenu={(event) => event.preventDefault()}
      style={{
        backgroundColor: theme.background,
        transition: 'background-color 700ms ease',
      }}
    >
      <Canvas
        shadows={{ enabled: true, type: PCFShadowMap }}
        camera={{ fov: 44, position: [8, 7.5, 8] }}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Suspense fallback={null}>
          <PerspectiveCamera makeDefault fov={44} position={[8, 7.5, 8]} />
          <ThemedEnvironment timeTheme={props.timeTheme} />
          <CloudLayer timeTheme={props.timeTheme} />
          <group>
            <VoxelTiles
              blocks={props.world.blocks}
              gaplessMode={props.gaplessMode}
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
              onHoverPosition={setHoverPosition}
              onSelect={props.onSelect}
              resolveBlockId={resolveBlockId}
              tool={props.tool}
            />
            <GhostPreview
              activeBuildMode={props.activeBuildMode}
              activeObject={props.activeObject}
              activeTerrain={props.activeTerrain}
              gaplessMode={props.gaplessMode}
              hoverPosition={hoverPosition}
              tool={props.tool}
            />
          </group>
          <ContactShadows
            blur={2.6}
            far={12}
            opacity={theme.shadowOpacity}
            position={[0, -0.02, 0]}
            scale={18}
          />
          <OrbitControls
            enableDamping
            enablePan
            enableZoom
            makeDefault
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            maxDistance={80}
            maxPolarAngle={Math.PI / 2.08}
            minDistance={4}
            screenSpacePanning
            target={[0, 0, 0]}
            touches={{
              ONE: TOUCH.ROTATE,
              TWO: TOUCH.DOLLY_PAN,
            }}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
