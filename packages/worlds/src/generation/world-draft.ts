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

export function isWorldDraft(value: unknown, worldId: string): value is World {
  if (!record(value) || value.schemaVersion !== 1 || value.id !== worldId)
    return false;
  const { bounds, spawns, objects, assets } = value;
  if (!record(bounds) || !measure(bounds.width) || !measure(bounds.depth))
    return false;
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
    return false;

  const assetIds = new Set<string>();
  for (const asset of assets) {
    if (!record(asset) || !identifier(asset.id) || assetIds.has(asset.id))
      return false;
    if (
      (asset.kind !== 'model' && asset.kind !== 'image') ||
      typeof asset.digest !== 'string' ||
      !/^[a-f0-9]{64}$/.test(asset.digest)
    )
      return false;
    assetIds.add(asset.id);
  }

  const objectIds = new Set<string>();
  for (const object of objects) {
    if (!record(object)) return false;
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
      return false;
    const { min, max } = objectBounds({
      id,
      kind,
      x,
      z,
      width,
      depth,
      elevation,
      heading: rotation,
    });
    if (!containsPoint(map, min) || !containsPoint(map, max)) return false;
    objectIds.add(id);
  }

  return spawns.every(
    (spawn) =>
      record(spawn) &&
      coordinate(spawn.x) &&
      coordinate(spawn.z) &&
      heading(spawn.heading) &&
      containsPoint(map, { x: spawn.x, z: spawn.z })
  );
}
