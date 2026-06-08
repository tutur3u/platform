import { describe, expect, it } from 'vitest';
import { applyHiveAgentInstruction } from '../agent';
import { createDefaultWorld } from '../world';

describe('applyHiveAgentInstruction', () => {
  it('turns river prompts into persisted water and bridge edits', () => {
    const result = applyHiveAgentInstruction(
      createDefaultWorld(),
      'Add a river with a bridge'
    );

    expect(result.changed).toBe(true);
    expect(result.actions).toContain('carved a river with bridge crossings');
    expect(result.world.blocks.some((block) => block.type === 'water')).toBe(
      true
    );
    expect(
      result.world.objects.some((object) => object.type === 'bridge')
    ).toBe(true);
  });

  it('builds farm refinements from natural language', () => {
    const result = applyHiveAgentInstruction(
      createDefaultWorld(),
      'Make farms with crops and trees'
    );

    expect(result.actions).toContain('planted paired farm plots');
    expect(result.world.blocks.some((block) => block.type === 'garden')).toBe(
      true
    );
    expect(result.world.objects.some((object) => object.type === 'crop')).toBe(
      true
    );
  });

  it('keeps empty prompts as no-op agent turns', () => {
    const world = createDefaultWorld();
    const result = applyHiveAgentInstruction(world, '   ');

    expect(result.changed).toBe(false);
    expect(result.world).toBe(world);
  });

  it('requires destructive permission for clear and reseed prompts', () => {
    const world = createDefaultWorld();

    const blocked = applyHiveAgentInstruction(world, 'clear the world');
    expect(blocked.changed).toBe(false);
    expect(blocked.world).toBe(world);

    const allowed = applyHiveAgentInstruction(world, 'clear the world', {
      allowDestructiveWorldActions: true,
    });
    expect(allowed.changed).toBe(true);
    expect(allowed.world.blocks).toHaveLength(0);

    const reseeded = applyHiveAgentInstruction(world, 'reseed default world', {
      allowDestructiveWorldActions: true,
    });
    expect(reseeded.changed).toBe(true);
    expect(reseeded.actions).toContain('reseeded the default world');
  });
});
