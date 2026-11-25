import { describe, expect, it } from 'vitest';
import { boardActorId } from './board-sync-actor';
import {
  type BoardOpenWindows,
  chargeBoardOpen,
  isSafeBoardLink,
  sanitizeGuestChanges,
  sanitizeGuestElement,
} from './board-sync-guest';
import type { BoardElement } from './board-sync-schema';

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
    const element = {
      id: 'a',
      type: 'rectangle',
      version: 1,
      versionNonce: 1,
      x: 4,
      link: 'javascript:alert(1)',
      customData: { a: 1 },
      __proto__hack: true,
    } as unknown as BoardElement;
    expect(sanitizeGuestElement(element)).toEqual({
      id: 'a',
      type: 'rectangle',
      version: 1,
      versionNonce: 1,
      x: 4,
      link: null,
    });
    expect(
      sanitizeGuestElement({ ...element, link: '/ok' } as BoardElement).link
    ).toBe('/ok');
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

describe('guest element types', () => {
  const base = {
    id: 'a',
    type: 'arrow',
    version: 2,
    versionNonce: 7,
    x: 1,
    y: 2,
    groupIds: ['g1'],
    points: [
      [0, 0],
      [10, 5],
    ],
    boundElements: [{ id: 't', type: 'text' }],
    roundness: { type: 2 },
    fontFamily: 5,
    startBinding: { elementId: 'b', focus: 0, gap: 4 },
    endArrowhead: 'arrow',
    strokeStyle: 'dashed',
    opacity: 100,
  };

  it('keeps a well-formed element', () => {
    expect(sanitizeGuestElement(base as unknown as BoardElement)).toEqual(
      base
    );
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
    ['fontFamily', {}],
    ['fontFamily', 1.5],
    ['x', 'NaN'],
    ['opacity', 400],
    ['strokeStyle', 'wavy'],
    ['startBinding', { elementId: 5 }],
    ['text', 'x'.repeat(20_001)],
    ['link', 7],
  ])('refuses %s set to a confused value', (key, value) => {
    expect(
      sanitizeGuestElement({ ...base, [key]: value } as unknown as BoardElement)
    ).toBeNull();
  });

  it('refuses a points array past ten thousand pairs', () => {
    const points = Array.from({ length: 10_001 }, () => [0, 0]);
    expect(
      sanitizeGuestElement({ ...base, points } as unknown as BoardElement)
    ).toBeNull();
  });

  it('drops the refused elements of a batch and counts them', () => {
    const element = (over: object) =>
      ({ ...base, ...over }) as unknown as BoardElement;
    const result = sanitizeGuestChanges([
      { type: 'insert', element: element({ id: 'ok' }) },
      { type: 'insert', element: element({ id: 'bad', groupIds: {} }) },
      { type: 'update', element: element({ id: 'ok2' }) },
    ]);
    expect(result.dropped).toBe(1);
    expect(result.changes.map((change) => change.element.id)).toEqual([
      'ok',
      'ok2',
    ]);
  });
});
