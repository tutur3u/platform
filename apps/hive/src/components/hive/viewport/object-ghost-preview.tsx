'use client';

import { Line } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import type { Group, Material, Mesh, Object3D, Vector3 } from 'three';
import {
  getObjectFootprint,
  getObjectFootprintCenter,
  type HiveObjectFootprint,
} from '@/engine/footprint';
import type { HiveObject } from '@/engine/types';
import { BuildingPrefab } from './building-prefabs';
import { ObjectPrefabBody } from './object-prefabs';

type ObjectGhostPreviewProps = {
  activeObject: string;
  position: Vector3;
};

type PreviewMaterialAssignment = {
  material: Material | Material[];
  mesh: Mesh;
};

const PREVIEW_OPACITY = 0.28;
const PREVIEW_RING = '#f5d77a';
const PREVIEW_RING_SHADOW = '#2b2415';

export function ObjectGhostPreview({
  activeObject,
  position,
}: ObjectGhostPreviewProps) {
  const object: HiveObject = {
    id: `preview:${activeObject}`,
    position: { x: position.x, y: 1, z: position.z },
    type: activeObject,
  };
  const footprint = getObjectFootprint(object.type, object.state);
  const center = getObjectFootprintCenter(object);
  const common = {
    position: [center.x, object.position.y - 1, center.z] as const,
    rotation: [0, 0, 0] as const,
  } satisfies ThreeElements['group'];
  const building = BuildingPrefab({
    common,
    footprint,
    object,
    ringColor: PREVIEW_RING,
  });

  if (building) {
    return (
      <PlacementGhostShell key={activeObject} footprint={footprint}>
        {building}
      </PlacementGhostShell>
    );
  }

  return (
    <PlacementGhostShell key={activeObject} footprint={footprint}>
      <group {...common} name={`${activeObject}-preview`}>
        <ObjectPrefabBody
          footprint={footprint}
          object={object}
          ringColor={PREVIEW_RING}
        />
      </group>
    </PlacementGhostShell>
  );
}

function PlacementGhostShell({
  children,
  footprint,
}: {
  children: ReactNode;
  footprint: HiveObjectFootprint;
}) {
  const groupRef = useRef<Group>(null);

  useLayoutEffect(() => {
    const assignments: PreviewMaterialAssignment[] = [];
    const previewMaterials: Material[] = [];

    groupRef.current?.traverse((node) => {
      if (!isMesh(node)) return;

      assignments.push({ material: node.material, mesh: node });
      node.castShadow = false;
      node.receiveShadow = false;
      node.renderOrder = 28;
      node.material = Array.isArray(node.material)
        ? node.material.map((material) =>
            createPreviewMaterial(material, previewMaterials)
          )
        : createPreviewMaterial(node.material, previewMaterials);
    });

    return () => {
      for (const assignment of assignments) {
        assignment.mesh.material = assignment.material;
      }

      for (const material of previewMaterials) {
        material.dispose();
      }
    };
  }, []);

  return (
    <group ref={groupRef}>
      {children}
      <PlacementFootprintCue footprint={footprint} />
    </group>
  );
}

function PlacementFootprintCue({
  footprint,
}: {
  footprint: HiveObjectFootprint;
}) {
  const halfWidth = footprint.width / 2 + 0.03;
  const halfDepth = footprint.depth / 2 + 0.03;
  const y = 0.08;
  const points: Array<[number, number, number]> = [
    [-halfWidth, y, -halfDepth],
    [halfWidth, y, -halfDepth],
    [halfWidth, y, -halfDepth],
    [halfWidth, y, halfDepth],
    [halfWidth, y, halfDepth],
    [-halfWidth, y, halfDepth],
    [-halfWidth, y, halfDepth],
    [-halfWidth, y, -halfDepth],
  ];
  const corners: Array<[number, number]> = [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ];

  return (
    <>
      <mesh position={[0, y - 0.025, 0]} renderOrder={25}>
        <boxGeometry
          args={[footprint.width + 0.02, 0.035, footprint.depth + 0.02]}
        />
        <meshStandardMaterial
          color={PREVIEW_RING}
          depthWrite={false}
          opacity={0.14}
          transparent
        />
      </mesh>
      <Line
        color={PREVIEW_RING_SHADOW}
        dashed
        dashSize={0.16}
        depthTest={false}
        gapSize={0.08}
        lineWidth={5.5}
        opacity={0.32}
        points={points}
        renderOrder={29}
        segments
        transparent
      />
      <Line
        color={PREVIEW_RING}
        dashed
        dashSize={0.16}
        depthTest={false}
        gapSize={0.08}
        lineWidth={3}
        opacity={0.86}
        points={points}
        renderOrder={30}
        segments
        transparent
      />
      {corners.map(([x, z]) => (
        <mesh key={`${x}:${z}`} position={[x, y + 0.045, z]} renderOrder={31}>
          <boxGeometry args={[0.08, 0.12, 0.08]} />
          <meshStandardMaterial
            color={PREVIEW_RING}
            depthWrite={false}
            opacity={0.5}
            transparent
          />
        </mesh>
      ))}
    </>
  );
}

function isMesh(node: Object3D): node is Mesh {
  return Boolean((node as Mesh).isMesh);
}

function createPreviewMaterial(
  material: Material,
  previewMaterials: Material[]
) {
  const preview = material.clone();
  preview.depthWrite = false;
  preview.opacity = Math.min(material.opacity, PREVIEW_OPACITY);
  preview.transparent = true;
  preview.needsUpdate = true;
  previewMaterials.push(preview);
  return preview;
}
