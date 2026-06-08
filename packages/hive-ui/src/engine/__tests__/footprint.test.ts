import {
  MAX_HIVE_OBJECT_FOOTPRINT_CELLS,
  MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
} from '@tuturuuu/realtime/hive';
import { describe, expect, it } from 'vitest';
import {
  getObjectFootprint,
  getObjectFootprintCells,
  normalizeObjectFootprint,
} from '../footprint';

describe('Hive object footprints', () => {
  it('ignores oversized persisted state footprints before allocating cells', () => {
    const state = {
      footprint: {
        depth: 1_000_000,
        width: 1_000_000,
      },
    };

    expect(getObjectFootprint('unknown-object', state)).toEqual({
      depth: 1,
      width: 1,
    });
    expect(
      getObjectFootprintCells({
        position: { x: 0, y: 1, z: 0 },
        state,
        type: 'unknown-object',
      })
    ).toHaveLength(1);
  });

  it('keeps bounded custom footprints available for world previews', () => {
    const footprint = normalizeObjectFootprint({
      depth: MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
      width: MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
    });

    expect(footprint).toEqual({
      autoExpandTerrain: false,
      depth: MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
      width: MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION,
    });
    expect(
      getObjectFootprintCells({
        position: { x: 0, y: 1, z: 0 },
        state: { footprint },
        type: 'unknown-object',
      })
    ).toHaveLength(MAX_HIVE_OBJECT_FOOTPRINT_CELLS);
  });

  it('does not coerce string or fractional footprint dimensions from state', () => {
    expect(
      getObjectFootprint('unknown-object', {
        footprint: {
          depth: 3,
          width: '2',
        },
      })
    ).toEqual({ depth: 1, width: 1 });

    expect(
      getObjectFootprint('unknown-object', {
        footprint: {
          depth: 3,
          width: 2.5,
        },
      })
    ).toEqual({ depth: 1, width: 1 });
  });
});
