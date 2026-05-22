'use client';

import type { HiveObjectFootprint } from '../../../engine/footprint';
import type { HiveObject } from '../../../engine/types';
import { getObjectPrefabColors } from './object-prefab-colors';

type ObjectUtilityPrefabProps = {
  footprint: HiveObjectFootprint;
  object: HiveObject;
};

export function BridgePrefab({ footprint, object }: ObjectUtilityPrefabProps) {
  const { accentColor, primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.15, 0]}>
        <boxGeometry
          args={[footprint.width * 0.96, 0.1, footprint.depth * 0.82]}
        />
        <meshStandardMaterial color={primaryColor} roughness={0.9} />
      </mesh>
      {[-footprint.width * 0.34, footprint.width * 0.34].map((x) => (
        <mesh castShadow key={x} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.08, 0.1, footprint.depth * 0.82]} />
          <meshStandardMaterial color={accentColor} roughness={0.8} />
        </mesh>
      ))}
      {[-0.4, 0.4].flatMap((x) =>
        [-0.35, 0.35].map((z) => (
          <mesh castShadow key={`${x}:${z}`} position={[x, 0.25, z]}>
            <boxGeometry args={[0.1, 0.2, 0.1]} />
            <meshStandardMaterial color={accentColor} />
          </mesh>
        ))
      )}
    </>
  );
}

export function LampMarkerPrefab({ object }: ObjectUtilityPrefabProps) {
  const { accentColor, primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial color="#4a4235" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.95, 0]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial
          color={object.type === 'lamp' ? accentColor : primaryColor}
          emissive={object.type === 'lamp' ? '#fac635' : '#000000'}
          emissiveIntensity={object.type === 'lamp' ? 0.8 : 0}
          roughness={0.2}
        />
      </mesh>
      {object.type === 'lamp' ? (
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#fac635" transparent opacity={0.15} />
        </mesh>
      ) : null}
    </>
  );
}

export function WellSpawnPrefab({ object }: ObjectUtilityPrefabProps) {
  const { primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.5, 8]} />
        <meshStandardMaterial color={primaryColor} roughness={0.9} />
      </mesh>
      {object.type === 'well' ? (
        <>
          {[-0.4, 0.4].map((x) => (
            <mesh castShadow key={x} position={[x, 0.6, 0]}>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color="#5a4231" />
            </mesh>
          ))}
          <mesh castShadow position={[0, 1.05, 0]}>
            <boxGeometry args={[1.0, 0.1, 0.6]} />
            <meshStandardMaterial color="#6a4a3a" />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.1, 8]} />
            <meshStandardMaterial color="#32637a" />
          </mesh>
        </>
      ) : null}
    </>
  );
}

export function SensorPrefab({ object }: ObjectUtilityPrefabProps) {
  const { accentColor, primaryColor } = getObjectPrefabColors(object);

  return (
    <>
      <mesh castShadow position={[0, 0.34, 0]}>
        <boxGeometry args={[0.24, 0.68, 0.24]} />
        <meshStandardMaterial color={primaryColor} roughness={0.65} />
      </mesh>
      <mesh castShadow position={[0, 0.78, 0]}>
        <boxGeometry args={[0.44, 0.2, 0.44]} />
        <meshStandardMaterial color={accentColor} roughness={0.48} />
      </mesh>
    </>
  );
}
