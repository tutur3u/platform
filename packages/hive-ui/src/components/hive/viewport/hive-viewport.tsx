'use client';

import {
  ContactShadows,
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { MOUSE, PCFShadowMap, TOUCH } from 'three';
import { cameraViewPresets } from '../../../engine/environment';
import { timeThemePresets } from '../../../engine/time-themes';
import type {
  HiveBuildMode,
  HiveCameraView,
  HiveNpc,
  HiveRealtimeAwareness,
  HiveSeason,
  HiveSelection,
  HiveTimeTheme,
  HiveTool,
  HiveVector3,
  HiveWeather,
  HiveWorldData,
} from '../../../engine/types';
import { CloudLayer } from './cloud-layer';
import { GhostPreview } from './ghost-preview';
import { NpcPrefab } from './npc-prefab';
import { ObjectPrefab } from './object-prefabs';
import { PlacementPlane } from './placement-plane';
import { RealtimePresenceMarkers } from './realtime-presence-markers';
import { SelectionOutline } from './selection-outline';
import { ThemedEnvironment } from './themed-environment';
import { VoxelTiles } from './voxel-tiles';
import { WeatherLayer } from './weather-layer';

type HiveViewportProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  cameraView: HiveCameraView;
  gaplessMode: boolean;
  npcs: HiveNpc[];
  onErase: (selection: NonNullable<HiveSelection>) => void;
  onMoveSelection: (position: HiveVector3) => void;
  onPlaceNpc: (position: HiveVector3) => void;
  onPlaceObject: (position: HiveVector3) => void;
  onPlaceTerrain: (position: HiveVector3) => void;
  onRealtimeCursor: (position: HiveVector3 | null) => void;
  onSelect: (selection: HiveSelection) => void;
  remoteAwareness: HiveRealtimeAwareness[];
  season: HiveSeason;
  selection: HiveSelection;
  timeTheme: HiveTimeTheme;
  tool: HiveTool;
  weather: HiveWeather;
  world: HiveWorldData;
};

export function HiveViewport(props: HiveViewportProps) {
  const [hoverPosition, setHoverPosition] = useState<HiveVector3 | null>(null);
  const cursorSentAtRef = useRef(0);
  const theme = useMemo(
    () => timeThemePresets[props.timeTheme],
    [props.timeTheme]
  );
  const cameraPreset = cameraViewPresets[props.cameraView];

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

  const setRealtimeHoverPosition = (position: HiveVector3 | null) => {
    setHoverPosition(position);
    const now = Date.now();
    if (position && now - cursorSentAtRef.current < 140) return;
    cursorSentAtRef.current = now;
    props.onRealtimeCursor(position);
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
        className="relative z-0"
        shadows={{ enabled: true, type: PCFShadowMap }}
        camera={cameraPreset}
        onPointerMissed={() => props.onSelect(null)}
      >
        <Suspense fallback={null}>
          <PerspectiveCamera
            fov={cameraPreset.fov}
            key={props.cameraView}
            makeDefault
            position={cameraPreset.position}
          />
          <ThemedEnvironment
            season={props.season}
            timeTheme={props.timeTheme}
            weather={props.weather}
          />
          <CloudLayer timeTheme={props.timeTheme} weather={props.weather} />
          <group>
            <VoxelTiles
              blocks={props.world.blocks}
              gaplessMode={props.gaplessMode}
              onErase={props.onErase}
              onSelect={(id) => props.onSelect({ id, kind: 'block' })}
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
              onHoverPosition={setRealtimeHoverPosition}
              onSelect={props.onSelect}
              resolveBlockId={resolveBlockId}
              tool={props.tool}
            />
            <RealtimePresenceMarkers awareness={props.remoteAwareness} />
            <SelectionOutline
              gaplessMode={props.gaplessMode}
              npcs={props.npcs}
              selection={props.selection}
              world={props.world}
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
          <WeatherLayer weather={props.weather} />
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
