'use client';

import type { HiveObjectFootprint } from '../../../engine/footprint';
import { getStyleColor } from '../../../engine/style';
import type { HiveObject } from '../../../engine/types';

type ResidentialBuildingPrefabProps = {
  footprint: HiveObjectFootprint;
  object: HiveObject;
  ringColor: string;
};

export function HousePrefab({
  footprint,
  object,
  ringColor,
}: ResidentialBuildingPrefabProps) {
  const cottage = object.type === 'cottage';
  const bodyWidth = footprint.width * (cottage ? 0.78 : 0.74);
  const bodyDepth = footprint.depth * (cottage ? 0.76 : 0.72);
  const frontZ = bodyDepth / 2 + 0.03;
  const bodyColor = getStyleColor(
    object.state,
    'color',
    cottage ? '#efd8bc' : '#e5ccb3'
  );
  const roofColor = getStyleColor(
    object.state,
    'accentColor',
    cottage ? '#4d8ed8' : '#c05a5a'
  );

  return (
    <>
      <mesh castShadow position={[0, 0.43, 0]}>
        <boxGeometry args={[bodyWidth, cottage ? 0.82 : 0.9, bodyDepth]} />
        <meshStandardMaterial color={bodyColor} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, frontZ]}>
        <boxGeometry args={[0.34, 0.58, 0.05]} />
        <meshStandardMaterial color="#6a4b3a" roughness={0.8} />
      </mesh>
      {[-bodyWidth * 0.27, bodyWidth * 0.27].map((x) => (
        <mesh key={x} position={[x, 0.48, frontZ]}>
          <boxGeometry args={[0.24, 0.25, 0.05]} />
          <meshStandardMaterial
            color="#88cbd8"
            emissive="#1a4d66"
            metalness={0.45}
            roughness={0.22}
          />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.02, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry
          args={[
            0,
            Math.max(0.74, Math.min(1.38, Math.max(bodyWidth, bodyDepth))),
            0.68,
            4,
          ]}
        />
        <meshStandardMaterial color={roofColor} roughness={0.78} />
      </mesh>
      <mesh castShadow position={[-bodyWidth * 0.3, 1.2, -bodyDepth * 0.22]}>
        <boxGeometry args={[0.18, 0.5, 0.18]} />
        <meshStandardMaterial color="#8e4a4a" />
      </mesh>
      <BuildingFootprintBase
        footprint={footprint}
        opacity={0.58}
        ringColor={ringColor}
      />
    </>
  );
}

export function TownhousePrefab({
  footprint,
  object,
  ringColor,
}: ResidentialBuildingPrefabProps) {
  const bodyColor = getStyleColor(object.state, 'color', '#d98a5b');
  const roofColor = getStyleColor(object.state, 'accentColor', '#5b84c6');

  return (
    <>
      <mesh castShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.86, 1.42, 0.82]} />
        <meshStandardMaterial color={bodyColor} roughness={0.82} />
      </mesh>
      {[0.35, 0.72, 1.08].map((y) =>
        [-0.22, 0.22].map((x) => (
          <mesh key={`${x}:${y}`} position={[x, y, 0.43]}>
            <boxGeometry args={[0.18, 0.18, 0.04]} />
            <meshStandardMaterial
              color="#9fd2e2"
              emissive="#173a4a"
              emissiveIntensity={0.12}
            />
          </mesh>
        ))
      )}
      <mesh position={[0, 1.48, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0, 0.78, 0.42, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.7} />
      </mesh>
      <BuildingFootprintBase
        footprint={footprint}
        opacity={0.5}
        ringColor={ringColor}
      />
    </>
  );
}

export function BuildingFootprintBase({
  footprint,
  opacity,
  ringColor,
}: {
  footprint: HiveObjectFootprint;
  opacity: number;
  ringColor: string;
}) {
  return (
    <mesh position={[0, 0.05, 0]}>
      <boxGeometry
        args={[footprint.width * 0.96, 0.1, footprint.depth * 0.96]}
      />
      <meshStandardMaterial color={ringColor} opacity={opacity} transparent />
    </mesh>
  );
}
