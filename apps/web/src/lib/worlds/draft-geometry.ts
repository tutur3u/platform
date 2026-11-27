import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import type { World, WorldObject } from '@tuturuuu/worlds';
import { geometryFields, validateObjectGeometry } from './object-geometry';

export const worldId = edufestHall.id;
export const maxRevision = 2_147_483_647;
const fields = [...geometryFields, 'heading'] as const;
type Geometry = Pick<WorldObject, 'id' | (typeof fields)[number]>;

export type WorldDraft = { revision: number; world: World };

export function parseDraftGeometry(input: unknown) {
  if (!Array.isArray(input) || input.length > edufestHall.objects.length) {
    return null;
  }

  const objects = new Map<string, WorldObject>();
  const geometry: Geometry[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return null;
    }
    const values: Record<string, unknown> = item;
    const { id } = values;
    if (typeof id !== 'string') return null;
    const sample = edufestHall.objects.find((object) => object.id === id);
    if (!sample || objects.has(id)) return null;

    const form = new FormData();
    for (const field of fields) {
      const value = values[field];
      if (typeof value !== 'number') return null;
      form.set(field, String(value));
    }
    const result = validateObjectGeometry(form, sample, edufestHall.bounds);
    if (result.status !== 'valid') return null;

    const { object } = result;
    objects.set(id, object);
    const { x, z, width, depth, elevation, heading } = object;
    if (fields.some((field) => object[field] !== sample[field])) {
      geometry.push({ id, x, z, width, depth, elevation, heading });
    }
  }

  const world: World = {
    ...edufestHall,
    objects: edufestHall.objects.map(
      (sample) => objects.get(sample.id) ?? sample
    ),
  };
  return { geometry, world };
}

export function parseDraftSave(input: unknown) {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('revision' in input) ||
    !('geometry' in input)
  ) {
    return null;
  }
  const { revision } = input;
  if (
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision >= maxRevision
  ) {
    return null;
  }
  const draft = parseDraftGeometry(input.geometry);
  return draft && { revision, ...draft };
}
