import { describe, expect, it } from 'vitest';
import { resolvePlacementPlaneAction } from '../placement-plane';

describe('resolvePlacementPlaneAction', () => {
  const position = { x: 2, y: 0, z: -1 };
  const resolveBlockId = () => 'block:2:0:-1';

  it('resolves eraser clicks on the placement plane to blocks', () => {
    expect(
      resolvePlacementPlaneAction({
        position,
        resolveBlockId,
        tool: 'erase',
      })
    ).toEqual({
      kind: 'erase',
      selection: { id: 'block:2:0:-1', kind: 'block' },
    });
  });

  it('keeps empty eraser clicks as no-op erase actions', () => {
    expect(
      resolvePlacementPlaneAction({
        position,
        resolveBlockId: () => null,
        tool: 'erase',
      })
    ).toEqual({
      kind: 'erase',
      selection: null,
    });
  });
});
