import {
  type Axis,
  boundaryRange,
  type LayoutNode,
  type StageLayout,
} from './layout-model';

/** A rectangle in fractions (0 to 1) of the pane area. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Boundary {
  key: string;
  splitId: string;
  index: number;
  axis: Axis;
  /** Where the boundary line falls along the split's axis, as a fraction. */
  at: number;
  /** The split's own rectangle: the boundary spans its cross extent. */
  span: Rect;
  now: number;
  min: number;
  max: number;
  /** The panes on either side, for the separator's name. */
  before: string;
  after: string;
}

export interface Geometry {
  panes: Record<string, Rect>;
  boundaries: Boundary[];
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

const firstPane = (node: LayoutNode): string =>
  node.kind === 'pane' ? node.id : firstPane(node.children[0] as LayoutNode);
const lastPane = (node: LayoutNode): string =>
  node.kind === 'pane'
    ? node.id
    : lastPane(node.children[node.children.length - 1] as LayoutNode);

/** Where every pane and boundary falls, with no measuring. */
export function layoutGeometry(layout: StageLayout): Geometry {
  const geometry: Geometry = { panes: {}, boundaries: [] };
  const place = (node: LayoutNode, rect: Rect) => {
    if (node.kind === 'pane') {
      geometry.panes[node.id] = rect;
      return;
    }
    let offset = 0;
    node.children.forEach((child, index) => {
      const share = (node.sizes[index] ?? 0) / 100;
      const childRect: Rect =
        node.axis === 'row'
          ? {
              x: rect.x + rect.w * offset,
              y: rect.y,
              w: rect.w * share,
              h: rect.h,
            }
          : {
              x: rect.x,
              y: rect.y + rect.h * offset,
              w: rect.w,
              h: rect.h * share,
            };
      place(child, childRect);
      offset += share;
      const next = node.children[index + 1];
      if (next) {
        const range = boundaryRange(node.sizes, index);
        geometry.boundaries.push({
          key: `${node.id}:${index}`,
          splitId: node.id,
          index,
          axis: node.axis,
          at:
            node.axis === 'row'
              ? rect.x + rect.w * (range.now / 100)
              : rect.y + rect.h * (range.now / 100),
          span: rect,
          now: range.now,
          min: range.min,
          max: range.max,
          before: lastPane(child),
          after: firstPane(next),
        });
      }
    });
  };
  if (layout.root) place(layout.root, FULL);
  return geometry;
}

const EDGE = 1e-6;

/**
 * CSS for a rectangle with `gutter` px between neighbours, so panes keep
 * their place when the container resizes. `inset` shrinks it further, for
 * a pane's border and header.
 */
export function rectStyle(
  rect: Rect,
  gutter: number,
  inset: { top?: number; right?: number; bottom?: number; left?: number } = {}
) {
  const half = gutter / 2;
  const left = (rect.x > EDGE ? half : 0) + (inset.left ?? 0);
  const top = (rect.y > EDGE ? half : 0) + (inset.top ?? 0);
  const right = (rect.x + rect.w < 1 - EDGE ? half : 0) + (inset.right ?? 0);
  const bottom = (rect.y + rect.h < 1 - EDGE ? half : 0) + (inset.bottom ?? 0);
  return {
    left: `calc(${rect.x * 100}% + ${left}px)`,
    top: `calc(${rect.y * 100}% + ${top}px)`,
    width: `calc(${rect.w * 100}% - ${left + right}px)`,
    height: `calc(${rect.h * 100}% - ${top + bottom}px)`,
  };
}

/** CSS for a boundary's grab area, centred on the gutter between two panes. */
export function boundaryStyle(boundary: Boundary, gutter: number) {
  const { span } = boundary;
  const half = gutter / 2;
  if (boundary.axis === 'row')
    return {
      left: `calc(${boundary.at * 100}% - ${half}px)`,
      width: `${gutter}px`,
      top: `calc(${span.y * 100}% + ${span.y > EDGE ? half : 0}px)`,
      height: `calc(${span.h * 100}% - ${(span.y > EDGE ? half : 0) + (span.y + span.h < 1 - EDGE ? half : 0)}px)`,
    };
  return {
    top: `calc(${boundary.at * 100}% - ${half}px)`,
    height: `${gutter}px`,
    left: `calc(${span.x * 100}% + ${span.x > EDGE ? half : 0}px)`,
    width: `calc(${span.w * 100}% - ${(span.x > EDGE ? half : 0) + (span.x + span.w < 1 - EDGE ? half : 0)}px)`,
  };
}

export type SizeClass = 'compact' | 'medium' | 'wide';

/** Container-query tiers: compact under 360px, medium to 720px, wide beyond. */
export function sizeClassOf(width: number): SizeClass {
  if (width < 360) return 'compact';
  return width > 720 ? 'wide' : 'medium';
}

export const MIN_USABLE_WIDTH = 280;
export const MIN_USABLE_HEIGHT = 220;

export const isTooSmall = (size: { width: number; height: number }) =>
  size.width < MIN_USABLE_WIDTH || size.height < MIN_USABLE_HEIGHT;
