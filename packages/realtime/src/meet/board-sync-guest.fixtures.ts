import type { BoardElement } from './board-sync-schema';

/** Fields every element type carries, at Excalidraw's usual values. */
const SHARED = {
  version: 1,
  versionNonce: 1,
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  angle: 0,
  strokeColor: '#1e1e1e',
  backgroundColor: 'transparent',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 100,
  seed: 1,
  groupIds: [] as string[],
};

const BY_TYPE: Readonly<Record<string, Record<string, unknown>>> = {
  rectangle: {},
  diamond: {},
  ellipse: {},
  frame: { name: null },
  magicframe: {},
  line: {
    points: [
      [0, 0],
      [200, 100],
    ],
  },
  arrow: {
    points: [
      [0, 0],
      [200, 100],
    ],
  },
  freedraw: {
    points: [
      [0, 0],
      [10, 10],
      [20, 5],
    ],
  },
  text: { text: 'Hello', fontSize: 20, fontFamily: 5, lineHeight: 1.25 },
};

/** A complete element of `type` that a guest may store; `over` replaces fields. */
export function guestElement(
  type: string,
  over: Record<string, unknown> = {}
): BoardElement {
  return {
    id: `${type}-1`,
    type,
    ...SHARED,
    ...BY_TYPE[type],
    ...over,
  } as unknown as BoardElement;
}

/** The same element without `field`, as a guest might send it. */
export function withoutField(element: BoardElement, field: string) {
  const copy: Record<string, unknown> = { ...element };
  delete copy[field];
  return copy as unknown as BoardElement;
}
