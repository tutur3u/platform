'use client';

import type { HiveObjectFootprint } from '../../../engine/footprint';
import { getStyleColor } from '../../../engine/style';
import type { HiveObject } from '../../../engine/types';
import { BuildingFootprintBase } from './residential-building-prefabs';

type CivicBuildingPrefabProps = {
  footprint: HiveObjectFootprint;
  object: HiveObject;
  ringColor: string;
};

export function CivicHallPrefab({
  footprint,
  object,
  ringColor,
}: CivicBuildingPrefabProps) {
  const bodyColor = getStyleColor(object.state, 'color', '#c96f62');
  const roofColor = getStyleColor(object.state, 'accentColor', '#494d5f');

  return (
    <>
      <mesh castShadow position={[0, 0.54, 0]}>
        <boxGeometry
          args={[footprint.width * 0.82, 0.98, footprint.depth * 0.68]}
        />
        <meshStandardMaterial color={bodyColor} roughness={0.78} />
      </mesh>
      {[-0.48, 0, 0.48].map((x) => (
        <mesh castShadow key={x} position={[x, 0.5, footprint.depth * 0.36]}>
          <boxGeometry args={[0.14, 0.78, 0.14]} />
          <meshStandardMaterial color="#f2e6d6" roughness={0.6} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.16, 0]}>
        <boxGeometry
          args={[footprint.width * 0.94, 0.24, footprint.depth * 0.82]}
        />
        <meshStandardMaterial color="#6d7180" roughness={0.62} />
      </mesh>
      <mesh castShadow position={[0, 1.34, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0, 1.18, 0.42, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.68} />
      </mesh>
      <BuildingFootprintBase
        footprint={footprint}
        opacity={0.48}
        ringColor={ringColor}
      />
    </>
  );
}

export function WatchtowerPrefab({
  footprint,
  object,
  ringColor,
}: CivicBuildingPrefabProps) {
  const bodyColor = getStyleColor(object.state, 'color', '#8f84c7');
  const roofColor = getStyleColor(object.state, 'accentColor', '#6559a8');

  return (
    <>
      {[-0.32, 0.32].flatMap((x) =>
        [-0.32, 0.32].map((z) => (
          <mesh castShadow key={`${x}:${z}`} position={[x, 0.62, z]}>
            <boxGeometry args={[0.12, 1.24, 0.12]} />
            <meshStandardMaterial color="#7a5737" roughness={0.82} />
          </mesh>
        ))
      )}
      <mesh castShadow position={[0, 1.22, 0]}>
        <boxGeometry args={[0.86, 0.38, 0.86]} />
        <meshStandardMaterial color={bodyColor} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 1.62, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0, 0.7, 0.48, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.66} />
      </mesh>
      <BuildingFootprintBase
        footprint={footprint}
        opacity={0.45}
        ringColor={ringColor}
      />
    </>
  );
}

export function WorkshopPrefab({
  footprint,
  object,
  ringColor,
}: CivicBuildingPrefabProps) {
  const bodyColor = getStyleColor(
    object.state,
    'color',
    object.type === 'greenhouse' ? '#7fb56a' : '#b76b55'
  );
  const roofColor = getStyleColor(
    object.state,
    'accentColor',
    object.type === 'greenhouse' ? '#b9d8a7' : '#6d7180'
  );

  return (
    <>
      <mesh castShadow position={[0, 0.34, 0]}>
        <boxGeometry
          args={[footprint.width * 0.86, 0.52, footprint.depth * 0.78]}
        />
        <meshStandardMaterial color={bodyColor} roughness={0.72} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <boxGeometry
          args={[footprint.width * 0.74, 0.24, footprint.depth * 0.64]}
        />
        <meshStandardMaterial
          color={roofColor}
          opacity={object.type === 'greenhouse' ? 0.78 : 1}
          roughness={0.58}
          transparent={object.type === 'greenhouse'}
        />
      </mesh>
      <BuildingFootprintBase
        footprint={footprint}
        opacity={0.45}
        ringColor={ringColor}
      />
    </>
  );
}
