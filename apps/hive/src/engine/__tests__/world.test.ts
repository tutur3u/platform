import { describe, expect, it } from 'vitest';
import {
  addObject,
  canPlaceObject,
  createDefaultWorld,
  moveObject,
  removeSelection,
  rotateObject,
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

  it('enforces terrain-specific object placement rules', () => {
    const world = createDefaultWorld();

    expect(canPlaceObject(world, { x: 0, y: 1, z: 0 }, 'bridge')).toEqual({
      allowed: false,
      reason: 'Bridge objects must be placed on water.',
    });
    expect(addObject(world, { x: 0, y: 1, z: 0 }, 'bridge')).toBe(world);

    const waterWorld = upsertBlock(world, { x: 1, y: 0, z: 1 }, 'water');
    expect(
      canPlaceObject(waterWorld, { x: 1, y: 1, z: 1 }, 'bridge').allowed
    ).toBe(true);
  });

  it('moves and rotates objects through world events', () => {
    const world = addObject(createDefaultWorld(), { x: 1, y: 1, z: 1 }, 'tree');
    const tree = world.objects.at(-1);
    expect(tree).toBeDefined();

    const moved = moveObject(world, tree!.id, { x: 2, y: 1, z: 2 });
    expect(
      moved.objects.find((object) => object.id === tree!.id)
    ).toMatchObject({
      position: { x: 2, y: 1, z: 2 },
    });

    const rotated = rotateObject(moved, tree!.id);
    expect(
      rotated.objects.find((object) => object.id === tree!.id)?.rotation
    ).toBe(90);
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
