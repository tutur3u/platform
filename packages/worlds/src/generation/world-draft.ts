import { containsPoint, objectBounds, type World } from '../runtime.ts';
import { generationLimits } from './contract.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function measure(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    value > 0 &&
    value <= generationLimits.mapExtent
  );
}

function coordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function heading(value: unknown): value is 0 | 90 | 180 | 270 {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function identifier(value: unknown): value is string {
  return (
    typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
  );
}

export function parseWorldDraft(value: unknown, worldId: string): World | null {
  if (!record(value) || value.schemaVersion !== 1 || value.id !== worldId)
    return null;
  const { bounds, spawns, objects, assets } = value;
  if (!record(bounds) || !measure(bounds.width) || !measure(bounds.depth))
    return null;
  const map = { width: bounds.width, depth: bounds.depth };
  if (
    !Array.isArray(spawns) ||
    spawns.length < 1 ||
    spawns.length > generationLimits.spawnCount ||
    !Array.isArray(objects) ||
    objects.length > generationLimits.objectCount ||
    !Array.isArray(assets) ||
    assets.length > generationLimits.assetCount
  )
    return null;

  const draft: World = {
    schemaVersion: 1,
    id: worldId,
    bounds: map,
    spawns: [],
    objects: [],
    assets: [],
  };
  const assetIds = new Set<string>();
  for (const asset of assets) {
    if (!record(asset) || !identifier(asset.id) || assetIds.has(asset.id))
      return null;
    if (
      (asset.kind !== 'model' && asset.kind !== 'image') ||
      typeof asset.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.digest)
    )
      return null;
    assetIds.add(asset.id);
    draft.assets.push({ id: asset.id, kind: asset.kind, digest: asset.digest });
  }

  const objectIds = new Set<string>();
  for (const object of objects) {
    if (!record(object)) return null;
    const {
      id,
      kind,
      x,
      z,
      width,
      depth,
      elevation,
      heading: rotation,
      assetId,
    } = object;
    if (
      !identifier(id) ||
      objectIds.has(id) ||
      (kind !== 'booth' && kind !== 'platform' && kind !== 'fixture') ||
      !coordinate(x) ||
      !coordinate(z) ||
      !measure(width) ||
      !measure(depth) ||
      !coordinate(elevation) ||
      elevation < 0 ||
      elevation > generationLimits.mapExtent ||
      !heading(rotation) ||
      (assetId !== undefined &&
        (!identifier(assetId) || !assetIds.has(assetId)))
    )
      return null;
    const item = {
      id,
      kind,
      x,
      z,
      width,
      depth,
      elevation,
      heading: rotation,
      ...(assetId === undefined ? {} : { assetId }),
    } satisfies World['objects'][number];
    const { min, max } = objectBounds(item);
    if (!containsPoint(map, min) || !containsPoint(map, max)) return null;
    objectIds.add(id);
    draft.objects.push(item);
  }

  for (const spawn of spawns) {
    if (!record(spawn)) return null;
    const { x, z, heading: rotation } = spawn;
    if (
      !coordinate(x) ||
      !coordinate(z) ||
      !heading(rotation) ||
      !containsPoint(map, { x, z })
    )
      return null;
    draft.spawns.push({ x, z, heading: rotation });
  }

  return draft;
}
