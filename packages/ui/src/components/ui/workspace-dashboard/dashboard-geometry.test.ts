import { describe, expect, it } from 'vitest';
import {
  type Box,
  type DashboardGeometry,
  findDashboardGeometryViolations,
  railPlacement,
} from './dashboard-geometry';

// Boxes measured in Chromium at a 728px viewport from the approved dashboard
// mock: once with the rail pinned beside the main column regardless of width
// (the defect), once with the container-query layout.
const squeezed: DashboardGeometry = {
  viewportWidth: 728,
  documentScrollWidth: 728,
  container: { name: 'dashboard', left: 257, top: 236, width: 446, height: 1439 },
  blocks: [
    { name: 'mira', left: 277, top: 420, width: 82, height: 358 },
    { name: 'next', left: 277, top: 794, width: 82, height: 150 },
    { name: 'tasks', left: 277, top: 960, width: 82, height: 408 },
    { name: 'agenda', left: 343, top: 256, width: 340, height: 284 },
  ],
  cards: [
    { name: 'next', left: 277, top: 794, width: 82, height: 150 },
    { name: 'tasks', left: 277, top: 960, width: 82, height: 408 },
    { name: 'agenda', left: 343, top: 256, width: 340, height: 284 },
  ],
  cardContents: {},
};

const stacked: DashboardGeometry = {
  viewportWidth: 728,
  documentScrollWidth: 728,
  container: { name: 'dashboard', left: 89, top: 236, width: 614, height: 1477 },
  blocks: [
    { name: 'mira', left: 109, top: 303, width: 574, height: 154 },
    { name: 'next', left: 109, top: 473, width: 574, height: 121 },
    { name: 'tasks', left: 109, top: 611, width: 574, height: 348 },
    { name: 'agenda', left: 109, top: 1209, width: 574, height: 273 },
  ],
  cards: [
    { name: 'next', left: 109, top: 473, width: 574, height: 121 },
    { name: 'tasks', left: 109, top: 611, width: 574, height: 348 },
    { name: 'agenda', left: 109, top: 1209, width: 574, height: 273 },
  ],
  cardContents: {},
};

describe('findDashboardGeometryViolations', () => {
  it('rejects the squeezed layout: overlapping rail and unreadable cards', () => {
    const violations = findDashboardGeometryViolations(squeezed);
    expect(violations).toContain('mira overlaps agenda (1920px²)');
    expect(violations).toContain('next is 82px wide');
    expect(violations).toContain('tasks is 82px wide');
  });

  it('accepts the container-query layout at the same viewport', () => {
    expect(findDashboardGeometryViolations(stacked)).toEqual([]);
  });

  it('flags horizontal page scroll and blocks outside the dashboard', () => {
    const wide: Box = { name: 'agenda', left: 600, top: 0, width: 340, height: 10 };
    const violations = findDashboardGeometryViolations({
      ...stacked,
      documentScrollWidth: 960,
      blocks: [wide],
      cards: [],
    });
    expect(violations).toContain('page scrolls horizontally: 960 > 728');
    expect(violations).toContain('agenda leaves the dashboard');
  });

  it('flags controls that overlap or escape inside a card', () => {
    const card: Box = { name: 'tasks', left: 0, top: 0, width: 300, height: 200 };
    const violations = findDashboardGeometryViolations({
      ...stacked,
      blocks: [],
      cards: [card],
      cardContents: {
        tasks: [
          { name: 'label:title', left: 10, top: 10, width: 200, height: 20 },
          { name: 'action:all', left: 150, top: 10, width: 60, height: 20 },
          { name: 'action:new', left: 280, top: 40, width: 40, height: 20 },
          { name: 'label:row', left: 10, top: 80, width: 30, height: 20 },
        ],
      },
    });
    expect(violations).toContain('label:title overlaps action:all in tasks');
    expect(violations).toContain('action:new escapes tasks');
    expect(violations).toContain('label:row in tasks is 30px');
  });
});

describe('railPlacement', () => {
  it('distinguishes a side rail from a stacked rail', () => {
    const main: Box = { name: 'main', left: 0, top: 0, width: 600, height: 10 };
    expect(railPlacement(main, { ...main, left: 616, width: 320 })).toBe('beside');
    expect(railPlacement(main, { ...main, top: 900 })).toBe('below');
  });
});
