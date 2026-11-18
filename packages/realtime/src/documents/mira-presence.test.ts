import { describe, expect, it } from 'vitest';
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import {
  MIRA_AWARENESS_CLIENT_ID,
  MIRA_DOCUMENT_COLOR,
  MIRA_DOCUMENT_USER_ID,
  miraAwarenessRemoval,
  miraAwarenessUpdate,
  miraCaretName,
  miraCursorSchema,
  readMiraAwareness,
} from './mira-presence';

function receiver() {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  return {
    awareness,
    destroy() {
      awareness.destroy();
      doc.destroy();
    },
  };
}

describe('Mira document awareness', () => {
  it('names the caret by source', () => {
    expect(miraCaretName('chat')).toBe('Mira • Chat');
    expect(miraCaretName('live')).toBe('Mira • Live');
  });

  it('publishes a named, colored caret with a live selection range', () => {
    const { awareness, destroy } = receiver();
    try {
      const cursor = {
        anchor: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
        head: { type: null, tname: 'prosemirror', item: null, assoc: 0 },
      };
      applyAwarenessUpdate(
        awareness,
        miraAwarenessUpdate({
          source: 'live',
          activeTabId: 'primary',
          statusText: 'Editing Lab Rubric · §2',
          cursor,
          clock: 10,
        }),
        'server'
      );
      const state = awareness.getStates().get(MIRA_AWARENESS_CLIENT_ID)!;
      expect(state).toMatchObject({
        user: {
          id: MIRA_DOCUMENT_USER_ID,
          name: 'Mira • Live',
          color: MIRA_DOCUMENT_COLOR,
        },
        cursor,
      });
      expect(readMiraAwareness(MIRA_AWARENESS_CLIENT_ID, state)).toEqual({
        source: 'live',
        activeTabId: 'primary',
        statusText: 'Editing Lab Rubric · §2',
      });
    } finally {
      destroy();
    }
  });

  it('lets a newer frame supersede and a removal clear Mira', () => {
    const { awareness, destroy } = receiver();
    try {
      applyAwarenessUpdate(
        awareness,
        miraAwarenessUpdate({ source: 'chat', activeTabId: 'a', clock: 5 }),
        'server'
      );
      applyAwarenessUpdate(
        awareness,
        miraAwarenessUpdate({ source: 'live', activeTabId: 'b', clock: 6 }),
        'server'
      );
      expect(
        readMiraAwareness(
          MIRA_AWARENESS_CLIENT_ID,
          awareness.getStates().get(MIRA_AWARENESS_CLIENT_ID)
        )?.activeTabId
      ).toBe('b');
      applyAwarenessUpdate(awareness, miraAwarenessRemoval(7), 'server');
      expect(awareness.getStates().has(MIRA_AWARENESS_CLIENT_ID)).toBe(false);
    } finally {
      destroy();
    }
  });

  it('ignores Mira-shaped state from any other client or identity', () => {
    const state = {
      user: { id: MIRA_DOCUMENT_USER_ID, name: 'Mira', color: '#000000' },
      mira: { source: 'chat', activeTabId: 'primary' },
    };
    expect(readMiraAwareness(42, state)).toBeNull();
    expect(
      readMiraAwareness(MIRA_AWARENESS_CLIENT_ID, {
        ...state,
        user: { ...state.user, id: 'f3b6c3a0-0000-4000-8000-000000000001' },
      })
    ).toBeNull();
    expect(readMiraAwareness(MIRA_AWARENESS_CLIENT_ID, null)).toBeNull();
  });

  it('bounds relative cursor positions', () => {
    const large = { item: 'x'.repeat(600) };
    expect(
      miraCursorSchema.safeParse({ anchor: large, head: {} }).success
    ).toBe(false);
    expect(miraCursorSchema.safeParse({ anchor: {}, head: {} }).success).toBe(
      true
    );
  });
});
