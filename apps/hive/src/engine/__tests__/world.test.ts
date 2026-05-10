import { describe, expect, it } from 'vitest';
import { addObject, createDefaultWorld, upsertBlock } from '../world';

describe('Hive world helpers', () => {
  it('keeps block placement revision payloads deterministic', () => {
    const world = createDefaultWorld();
    const updated = upsertBlock(world, { x: 1.2, y: 0, z: -2.6 }, 'water');

    expect(updated.blocks).toContainEqual({
      id: 'block:1:0:-3',
      position: { x: 1, y: 0, z: -3 },
      type: 'water',
    });
  });

  it('snaps placed objects to the surface layer', () => {
    const world = createDefaultWorld();
    const updated = addObject(world, { x: 2.4, y: 9, z: 2.4 }, 'house');

    expect(updated.objects.at(-1)).toMatchObject({
      position: { x: 2, y: 1, z: 2 },
      type: 'house',
    });
  });
});
