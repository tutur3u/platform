import { describe, expect, it } from 'vitest';
import {
  extractWhiteboardImageFileIds,
  isExcalidrawSnapshot,
  parseStoredWhiteboardSnapshot,
} from './snapshot';

describe('parseStoredWhiteboardSnapshot', () => {
  it('parses JSON strings, passes objects through and rejects junk', () => {
    expect(parseStoredWhiteboardSnapshot('{"elements":[]}')).toEqual({
      elements: [],
    });
    expect(parseStoredWhiteboardSnapshot({ elements: [] })).toEqual({
      elements: [],
    });
    expect(parseStoredWhiteboardSnapshot('not json')).toBeNull();
    expect(parseStoredWhiteboardSnapshot(null)).toBeNull();
    expect(parseStoredWhiteboardSnapshot(undefined)).toBeNull();
  });
});

describe('isExcalidrawSnapshot', () => {
  it('requires an elements array', () => {
    expect(isExcalidrawSnapshot({ elements: [] })).toBe(true);
    expect(isExcalidrawSnapshot({ store: {} })).toBe(false);
    expect(isExcalidrawSnapshot(null)).toBe(false);
  });
});

describe('extractWhiteboardImageFileIds', () => {
  const snapshot = {
    elements: [
      { type: 'image', fileId: 'ws/board/a.png' },
      { type: 'image', fileId: 'other/b.png' },
      { type: 'image', fileId: 'ws/../escape.png' },
      { type: 'rectangle', fileId: 'ws/board/c.png' },
      null,
    ],
  };

  it('collects image file ids and skips traversal attempts', () => {
    expect([...extractWhiteboardImageFileIds(snapshot)].sort()).toEqual([
      'other/b.png',
      'ws/board/a.png',
    ]);
  });

  it('honors the expected prefix', () => {
    expect([...extractWhiteboardImageFileIds(snapshot, 'ws/board/')]).toEqual([
      'ws/board/a.png',
    ]);
  });
});
