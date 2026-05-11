import { describe, expect, it } from 'vitest';
import {
  addObject,
  createDefaultWorld,
  removeSelection,
  upsertBlock,
} from '../world';

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

  it('replaces objects on the same tile instead of stacking them', () => {
    const world = addObject(createDefaultWorld(), { x: 1, y: 4, z: 1 }, 'tree');
    const updated = addObject(world, { x: 1, y: 4, z: 1 }, 'house');

    expect(
      updated.objects.filter(
        (object) => object.position.x === 1 && object.position.z === 1
      )
    ).toHaveLength(1);
    expect(updated.objects.at(-1)).toMatchObject({ type: 'house' });
  });

  it('removes selected blocks and objects for eraser actions', () => {
    const world = createDefaultWorld();
    const removedBlock = removeSelection(world, [], {
      id: 'block:0:0:0',
      kind: 'block',
    });

    expect(
      removedBlock.world.blocks.some((block) => block.id === 'block:0:0:0')
    ).toBe(false);

    const removedObject = removeSelection(world, [], {
      id: 'object:house:seed',
      kind: 'object',
    });

    expect(
      removedObject.world.objects.some(
        (object) => object.id === 'object:house:seed'
      )
    ).toBe(false);
  });
});
