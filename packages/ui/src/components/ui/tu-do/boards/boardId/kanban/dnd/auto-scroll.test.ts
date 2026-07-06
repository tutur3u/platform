import { describe, expect, it } from 'vitest';
import { getKanbanEdgeAutoScrollAmount } from './auto-scroll';

const rect = {
  left: 100,
  right: 500,
};

describe('getKanbanEdgeAutoScrollAmount', () => {
  it('scrolls left when the drag center is near the left edge', () => {
    expect(
      getKanbanEdgeAutoScrollAmount(125, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBeLessThan(0);
  });

  it('scrolls right when the drag center is near the right edge', () => {
    expect(
      getKanbanEdgeAutoScrollAmount(475, rect, {
        threshold: 100,
        speed: 10,
        maxSpeed: 30,
      })
    ).toBeGreaterThan(0);
  });

  it('does nothing away from horizontal edges or without a drag center', () => {
    expect(getKanbanEdgeAutoScrollAmount(300, rect)).toBe(0);
    expect(getKanbanEdgeAutoScrollAmount(null, rect)).toBe(0);
  });
});
