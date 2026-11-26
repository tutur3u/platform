import { deepStrictEqual, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import sample from './edufest-hall.json' with { type: 'json' };
import { containsPoint, objectsAt, type World, type WorldObject } from './runtime.ts';

describe('EduFest sample world', () => {
  it('keeps the entrance and exported object centers in the hall', () => {
    deepStrictEqual(sample.bounds, { width: 42, depth: 32.65 });
    deepStrictEqual(sample.spawns, [{ x: 21, z: 31.35, heading: 180 }]);
    strictEqual(sample.objects.filter((object) => object.kind === 'booth').length, 55);
    strictEqual(new Set(sample.objects.map((object) => object.id)).size, sample.objects.length);
    strictEqual([...sample.spawns, ...sample.objects].every((point) => containsPoint(sample.bounds, point)), true);
    strictEqual(containsPoint(sample.bounds, { x: NaN, z: 0 }), false);
  });

  it('finds the visible footprint of an east-facing booth', () => {
    const booth: WorldObject = {
      id: 'booth',
      kind: 'booth',
      x: 5,
      z: 5,
      width: 4,
      depth: 2,
      heading: 90,
      elevation: 0,
    };
    const world: World = {
      schemaVersion: 1,
      id: 'test',
      bounds: { width: 10, depth: 10 },
      objects: [booth],
      spawns: [],
      assets: [],
    };
    deepStrictEqual(objectsAt(world, { x: 5, z: 7 }), [booth]);
    deepStrictEqual(objectsAt(world, { x: 6.1, z: 5 }), []);
  });
});
