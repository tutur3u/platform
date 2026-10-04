import { describe, expect, it } from 'vitest';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import * as Y from 'yjs';
import { awarenessRemoval, normalizeAwarenessUpdate } from './awareness';

describe('authenticated cursor wire boundary', () => {
  it('binds a forged user identity to the signed actor and ignores other clients', () => {
    const doc = new Y.Doc();
    const peerDoc = new Y.Doc();
    const receiveDoc = new Y.Doc();
    const sender = new Awareness(doc);
    const peer = new Awareness(peerDoc);
    const receive = new Awareness(receiveDoc);
    try {
      sender.setLocalState({
        user: { id: 'spoof', name: 'Alex' },
        cursor: { anchor: 1 },
      });
      const normalized = normalizeAwarenessUpdate(
        encodeAwarenessUpdate(sender, [doc.clientID]),
        'actor'
      )!;
      applyAwarenessUpdate(receive, normalized.update, 'fixture');
      expect(receive.getStates().get(doc.clientID)).toMatchObject({
        user: { id: 'actor' },
        cursor: { anchor: 1 },
      });
      peer.setLocalState({ user: { id: 'other' } });
      expect(
        normalizeAwarenessUpdate(
          encodeAwarenessUpdate(peer, [peerDoc.clientID]),
          'actor',
          doc.clientID
        )
      ).toBeNull();
      applyAwarenessUpdate(
        receive,
        awarenessRemoval(doc.clientID, normalized.clock),
        'fixture'
      );
      expect(receive.getStates().has(doc.clientID)).toBe(false);
    } finally {
      sender.destroy();
      peer.destroy();
      receive.destroy();
      doc.destroy();
      peerDoc.destroy();
      receiveDoc.destroy();
    }
  });
  it('rejects oversized and malformed binary frames', () => {
    expect(() =>
      normalizeAwarenessUpdate(new Uint8Array(17000), 'actor')
    ).toThrow('Awareness exceeds limit');
    expect(() =>
      normalizeAwarenessUpdate(new Uint8Array([1]), 'actor')
    ).toThrow();
  });
});
