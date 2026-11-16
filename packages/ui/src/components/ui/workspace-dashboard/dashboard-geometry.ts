/**
 * Layout geometry rules for the workspace overview. Pure so the same checks
 * run against boxes measured in a real browser (e2e) and against recorded
 * fixtures (unit tests).
 */

export interface Box {
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DashboardGeometry {
  viewportWidth: number;
  documentScrollWidth: number;
  /** Bounds of the dashboard layout container. */
  container: Box;
  /** Top-level blocks: every card plus main-column slots such as Mira. */
  blocks: Box[];
  cards: Box[];
  /** Controls and labels inside one card, keyed by the card name. */
  cardContents: Record<string, Box[]>;
}

export const DASHBOARD_GEOMETRY_LIMITS = {
  /** A card narrower than this cannot show a title plus one action. */
  minCardWidth: 240,
  /** Visible part of a truncated label. */
  minLabelWidth: 48,
  /** Overlap tolerance in px for sub-pixel rounding. */
  epsilon: 0.5,
} as const;

const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;

export function overlapArea(a: Box, b: Box, epsilon = 0.5) {
  const w = Math.min(right(a), right(b)) - Math.max(a.left, b.left);
  const h = Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top);
  return w > epsilon && h > epsilon ? w * h : 0;
}

function contains(outer: Box, inner: Box, epsilon: number) {
  return (
    inner.left >= outer.left - epsilon && right(inner) <= right(outer) + epsilon
  );
}

/** Every violated rule as a readable message; empty means the layout holds. */
export function findDashboardGeometryViolations(
  geometry: DashboardGeometry,
  limits = DASHBOARD_GEOMETRY_LIMITS
): string[] {
  const { epsilon } = limits;
  const violations: string[] = [];

  if (geometry.documentScrollWidth > geometry.viewportWidth + 1) {
    violations.push(
      `page scrolls horizontally: ${geometry.documentScrollWidth} > ${geometry.viewportWidth}`
    );
  }

  const blocks = geometry.blocks.filter((b) => b.width > 0 && b.height > 0);
  for (let i = 0; i < blocks.length; i++) {
    const a = blocks[i]!;
    if (!contains(geometry.container, a, epsilon)) {
      violations.push(`${a.name} leaves the dashboard`);
    }
    for (let j = i + 1; j < blocks.length; j++) {
      const b = blocks[j]!;
      const area = overlapArea(a, b, epsilon);
      if (area) {
        violations.push(`${a.name} overlaps ${b.name} (${Math.round(area)}px²)`);
      }
    }
  }

  for (const card of geometry.cards) {
    if (card.width > 0 && card.width < limits.minCardWidth) {
      violations.push(`${card.name} is ${Math.round(card.width)}px wide`);
    }
    const items = (geometry.cardContents[card.name] ?? []).filter(
      (b) => b.width > 0 && b.height > 0
    );
    for (let i = 0; i < items.length; i++) {
      const a = items[i]!;
      if (!contains(card, a, epsilon)) {
        violations.push(`${a.name} escapes ${card.name}`);
      }
      if (a.width < limits.minLabelWidth && a.name.startsWith('label:')) {
        violations.push(`${a.name} in ${card.name} is ${Math.round(a.width)}px`);
      }
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j]!;
        if (overlapArea(a, b, 2)) {
          violations.push(`${a.name} overlaps ${b.name} in ${card.name}`);
        }
      }
    }
  }

  return violations;
}

/** Expected placement of the rail for a measured layout. */
export function railPlacement(main: Box, rail: Box): 'beside' | 'below' {
  return rail.left >= right(main) - DASHBOARD_GEOMETRY_LIMITS.epsilon
    ? 'beside'
    : 'below';
}
