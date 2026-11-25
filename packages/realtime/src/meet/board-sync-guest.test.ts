import { describe, expect, it } from 'vitest';
import { boardActorId } from './board-sync-actor';
import { elementRenderCost } from './board-sync-cost';
import {
  MAX_GUEST_ELEMENT_COST,
  MAX_GUEST_TEXT_LINES,
} from './board-sync-guest-element';
import { guestElement, withoutField } from './board-sync-guest.fixtures';
import {
  type BoardOpenWindows,
  chargeBoardOpen,
  isSafeBoardLink,
  sanitizeGuestChanges,
  sanitizeGuestElement,
} from './board-sync-guest';

describe('guest board links', () => {
  it('keeps http(s) and same-site links only', () => {
    for (const link of [
      'https://example.com',
      'http://example.com/a?b=1',
      '/workspace/page',
      '?element=abc',
      '#frame',
    ])
      expect(isSafeBoardLink(link)).toBe(true);
    for (const link of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,hi',
      '//evil.example',
      'vbscript:x',
      'not a url',
      42,
      null,
      '/\\evil.example',
      '/\t/evil.example',
      '\nhttps://evil.example',
      'https://example.com/\u0000',
      '/page\u007f',
    ])
      expect(isSafeBoardLink(link)).toBe(false);
  });

  it('drops unknown fields and unsafe links from guest elements', () => {
    const element = guestElement('rectangle', {
      link: 'javascript:alert(1)',
      customData: { a: 1 },
      points: [[0, 0]],
    });
    const kept = sanitizeGuestElement(element);
    expect(kept).not.toBeNull();
    expect(kept!.link).toBeNull();
    // A field another type uses is dropped too.
    expect('customData' in kept! || 'points' in kept!).toBe(false);
    const safe = sanitizeGuestElement({ ...element, link: '/ok' });
    expect(safe).not.toBeNull();
    expect(safe!.link).toBe('/ok');
  });
});

describe('guest socket opens', () => {
  it('allows a few opens a minute per person', () => {
    const windows: BoardOpenWindows = new Map();
    for (let i = 0; i < 6; i++)
      expect(chargeBoardOpen(windows, 'g', 6, i * 1000)).toBe(true);
    expect(chargeBoardOpen(windows, 'g', 6, 10_000)).toBe(false);
    expect(chargeBoardOpen(windows, 'other', 6, 10_000)).toBe(true);
    expect(chargeBoardOpen(windows, 'g', 6, 60_000)).toBe(true);
  });

  it('tracks at most a thousand people', () => {
    const windows: BoardOpenWindows = new Map();
    for (let i = 0; i < 1500; i++) chargeBoardOpen(windows, `g${i}`, 6, 0);
    expect(windows.size).toBe(1000);
    expect(windows.has('g1499')).toBe(true);
  });
});

describe('board actor ids', () => {
  it('is stable per board and person and hides the user id', () => {
    const id = boardActorId('secret-secret', 'board-1', 'user-1');
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(id).not.toContain('user-1');
    expect(boardActorId('secret-secret', 'board-1', 'user-1')).toBe(id);
    expect(boardActorId('secret-secret', 'board-2', 'user-1')).not.toBe(id);
    expect(boardActorId('other-secret', 'board-1', 'user-1')).not.toBe(id);
    expect(() => boardActorId(' ', 'board-1', 'user-1')).toThrow();
  });
});

describe('guest element required fields', () => {
  it.each([
    'rectangle',
    'diamond',
    'ellipse',
    'frame',
    'line',
    'arrow',
    'freedraw',
    'text',
  ])('keeps a complete %s', (type) => {
    expect(sanitizeGuestElement(guestElement(type))).not.toBeNull();
  });

  const shared = [
    'x',
    'y',
    'width',
    'height',
    'angle',
    'strokeWidth',
    'roughness',
    'opacity',
    'seed',
    'groupIds',
    'strokeColor',
    'backgroundColor',
    'fillStyle',
    'strokeStyle',
  ];
  it.each(
    ['rectangle', 'freedraw', 'text'].flatMap((type) =>
      shared.map((field) => [type, field] as const)
    )
  )('refuses a %s without %s', (type, field) => {
    expect(
      sanitizeGuestElement(withoutField(guestElement(type), field))
    ).toBeNull();
  });

  it.each([
    ['text', 'text'],
    ['text', 'fontSize'],
    ['text', 'fontFamily'],
    ['text', 'lineHeight'],
    ['line', 'points'],
    ['arrow', 'points'],
    ['freedraw', 'points'],
  ])('refuses a %s without %s', (type, field) => {
    expect(
      sanitizeGuestElement(withoutField(guestElement(type), field))
    ).toBeNull();
  });

  it('needs two points on a line or arrow and one on a freehand stroke', () => {
    const one = { points: [[0, 0]] };
    expect(sanitizeGuestElement(guestElement('line', one))).toBeNull();
    expect(sanitizeGuestElement(guestElement('arrow', one))).toBeNull();
    expect(sanitizeGuestElement(guestElement('freedraw', one))).not.toBeNull();
    expect(
      sanitizeGuestElement(guestElement('freedraw', { points: [] }))
    ).toBeNull();
  });

  it('needs a pressure per point or simulated pressure when freehand', () => {
    const stroke = (over: Record<string, unknown>) =>
      sanitizeGuestElement(guestElement('freedraw', over));
    // Without either, Excalidraw draws it invisibly and logs every render.
    expect(stroke({ simulatePressure: false, pressures: [] })).toBeNull();
    expect(
      stroke({ simulatePressure: undefined, pressures: undefined })
    ).toBeNull();
    expect(
      stroke({ simulatePressure: false, pressures: [0.5, 0.5] })
    ).toBeNull();
    expect(
      stroke({ simulatePressure: false, pressures: [0.5, 0.5, 0.5] })
    ).not.toBeNull();
    expect(stroke({ simulatePressure: true, pressures: [] })).not.toBeNull();
  });

  it('refuses a rectangle or diamond without a height', () => {
    for (const type of ['rectangle', 'diamond'])
      expect(
        sanitizeGuestElement(withoutField(guestElement(type), 'height'))
      ).toBeNull();
  });

  it('caps text at 500 lines', () => {
    const lines = (count: number) =>
      guestElement('text', { text: Array(count).fill('a').join('\n') });
    expect(sanitizeGuestElement(lines(MAX_GUEST_TEXT_LINES))).not.toBeNull();
    expect(sanitizeGuestElement(lines(MAX_GUEST_TEXT_LINES + 1))).toBeNull();
  });
});

describe('guest element types', () => {
  const arrow = (over: Record<string, unknown> = {}) =>
    guestElement('arrow', {
      groupIds: ['g1'],
      boundElements: [{ id: 't', type: 'text' }],
      roundness: { type: 2 },
      startBinding: { elementId: 'b', focus: 0, gap: 4 },
      endArrowhead: 'arrow',
      strokeStyle: 'dashed',
      ...over,
    });
  const text = (over: Record<string, unknown>) => guestElement('text', over);

  it('keeps a well-formed element as sent', () => {
    expect(sanitizeGuestElement(arrow())).toEqual(arrow());
  });

  it.each([
    ['groupIds', {}],
    ['groupIds', Array.from({ length: 33 }, (_, i) => `g${i}`)],
    ['points', 'x'],
    ['points', [[0, Number.POSITIVE_INFINITY]]],
    ['points', [[0, 0, 0]]],
    ['boundElements', 1],
    ['boundElements', [{ id: 't', type: 'image' }]],
    ['roundness', 1],
    ['x', 'NaN'],
    ['opacity', 400],
    ['strokeStyle', 'wavy'],
    ['startBinding', { elementId: 5 }],
    ['link', 7],
  ])('refuses %s set to a confused value', (key, value) => {
    expect(sanitizeGuestElement(arrow({ [key]: value }))).toBeNull();
  });

  it.each([
    ['fontFamily', {}],
    ['fontFamily', 1.5],
    ['text', 'x'.repeat(20_001)],
  ])('refuses text %s set to a confused value', (key, value) => {
    expect(sanitizeGuestElement(text({ [key]: value }))).toBeNull();
  });

  it('refuses a points array past ten thousand pairs', () => {
    const points = Array.from({ length: 10_001 }, () => [0, 0]);
    expect(sanitizeGuestElement(arrow({ points }))).toBeNull();
  });

  it('drops the refused elements of a batch and counts them', () => {
    const result = sanitizeGuestChanges([
      { type: 'insert', element: arrow({ id: 'ok' }) },
      { type: 'insert', element: arrow({ id: 'bad', groupIds: {} }) },
      { type: 'update', element: arrow({ id: 'ok2' }) },
    ]);
    expect(result.dropped).toBe(1);
    expect(result.changes.map((change) => change.element.id)).toEqual([
      'ok',
      'ok2',
    ]);
  });
});

describe('guest element ranges', () => {
  const filled = { fillStyle: 'hachure', backgroundColor: '#ffc9c9' };

  it('refuses a hachure fill that would freeze every viewer', () => {
    const exploit = { ...filled, strokeWidth: 0.01, height: 1e9 };
    expect(sanitizeGuestElement(guestElement('rectangle', exploit))).toBeNull();
    // Even inside every single range, the render cost still refuses.
    const wide = guestElement('rectangle', {
      ...filled,
      fillStyle: 'cross-hatch',
      strokeWidth: 0.5,
      width: 1e4,
      height: 1e4,
    });
    expect(elementRenderCost(wide)).toBeGreaterThan(MAX_GUEST_ELEMENT_COST);
    expect(sanitizeGuestElement(wide)).toBeNull();
    expect(
      sanitizeGuestElement({ ...wide, fillStyle: 'solid' } as typeof wide)
    ).not.toBeNull();
  });

  it.each([
    ['rectangle', 'x', 1e6, 1e6 + 1],
    ['rectangle', 'y', -1e6, -1e6 - 1],
    ['rectangle', 'width', 1e4, 1e4 + 1],
    ['rectangle', 'width', 0, -1],
    ['rectangle', 'height', 1e4, 1e4 + 1],
    ['rectangle', 'strokeWidth', 0.5, 0.49],
    ['rectangle', 'strokeWidth', 64, 65],
    ['rectangle', 'roughness', 5, 6],
    ['rectangle', 'roughness', 0, -1],
    ['rectangle', 'opacity', 0, -1],
    ['rectangle', 'angle', 8 * Math.PI, 8 * Math.PI + 1],
    ['rectangle', 'seed', 2 ** 31, 2 ** 31 + 1],
    ['rectangle', 'version', 0, -1],
    ['rectangle', 'versionNonce', -(2 ** 31), -(2 ** 31) - 1],
    [
      'rectangle',
      'roundness',
      { type: 3, value: 1e5 },
      { type: 3, value: 1e5 + 1 },
    ],
    ['text', 'lineHeight', 0.5, 0.4],
    ['text', 'lineHeight', 10, 11],
    ['text', 'fontSize', 1, 0.5],
    ['text', 'fontSize', 2048, 2049],
    [
      'line',
      'points',
      [
        [0, 0],
        [1e5, -1e5],
      ],
      [
        [0, 0],
        [1e5 + 1, 0],
      ],
    ],
    ['freedraw', 'pressures', [0, 1], [1.5]],
    [
      'arrow',
      'startBinding',
      { elementId: 'b', focus: 1, gap: 0, fixedPoint: [0, 1] },
      { elementId: 'b', focus: 1.1, gap: 0 },
    ],
    [
      'arrow',
      'endBinding',
      { elementId: 'b', fixedPoint: [-1, 2] },
      { elementId: 'b', fixedPoint: [0, 3] },
    ],
  ])('keeps a %s %s at its bound and refuses it past', (type, key, edge, past) => {
    const at = (value: unknown) =>
      sanitizeGuestElement(guestElement(type, { [key]: value }));
    expect(at(edge)).not.toBeNull();
    expect(at(past)).toBeNull();
  });
});
