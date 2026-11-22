import { expect } from 'vitest';
import type {
  ElementChangeBatch,
  WhiteboardAssets,
  WhiteboardPersistence,
  WhiteboardTransport,
  WhiteboardTransportHandlers,
} from '../adapters';
import { makeElement } from './fixtures';

/**
 * Behavior every WhiteboardPersistence must have, starting from an empty board.
 * `load` is optional on the interface; when present it must return what was saved.
 */
export async function expectPersistenceContract(
  persistence: WhiteboardPersistence
) {
  const snapshot = { elements: [makeElement('a'), makeElement('b')] };

  const saved = await persistence.save(snapshot);
  expect(saved).toHaveProperty('revision');

  const load = persistence.load?.bind(persistence);
  if (!load) return;

  const loaded = await load();
  expect(loaded.snapshot?.elements?.map((el) => el.id)).toEqual(['a', 'b']);
  expect(loaded.revision).toBe(saved.revision);

  const next = await persistence.save({ elements: [makeElement('c')] });
  const reloaded = await load();
  expect(reloaded.snapshot?.elements?.map((el) => el.id)).toEqual(['c']);
  expect(reloaded.revision).toBe(next.revision);
  if (saved.revision !== null) {
    expect(next.revision).not.toBe(saved.revision);
  }
}

/** Behavior every WhiteboardAssets must have. */
export async function expectAssetsContract(assets: WhiteboardAssets) {
  const fileId = await assets.upload(
    new File(['pixels'], 'pic.png', { type: 'image/png' })
  );
  expect(typeof fileId).toBe('string');
  expect(fileId.length).toBeGreaterThan(0);

  const url = await assets.resolveUrl(fileId);
  expect(typeof url).toBe('string');

  expect(await assets.resolveUrl('missing-file-id')).toBeNull();
}

/**
 * Behavior every WhiteboardTransport must have, given a peer connected to the
 * same board. Both sides must see each other's batches, and a transport must
 * stop delivering after `connect`'s disposer runs.
 */
export async function expectTransportContract(
  a: WhiteboardTransport,
  b: WhiteboardTransport,
  settle: () => Promise<void>
) {
  const received: ElementChangeBatch[] = [];
  const makeHandlers = (
    id: string,
    sink: ElementChangeBatch[] = []
  ): WhiteboardTransportHandlers => ({
    user: { id, displayName: id },
    onStatus: () => {},
    onElementChanges: (batch) => sink.push(batch),
    onCursor: () => {},
    onSelection: () => {},
  });

  const disconnectA = a.connect(makeHandlers('a'));
  const disconnectB = b.connect(makeHandlers('b', received));
  await settle();

  const batch: ElementChangeBatch = {
    senderId: 'a',
    changes: [{ element: makeElement('x'), type: 'insert' }],
    timestamp: 1,
  };
  await a.sendElementChanges(batch);
  await settle();

  expect(received).toHaveLength(1);
  expect(received[0]?.changes[0]?.element.id).toBe('x');

  // From the moment a consumer disconnects it receives nothing more, even if
  // the transport keeps its connection open for a quick reconnect.
  disconnectB();
  await a.sendElementChanges({ ...batch, timestamp: 2 });
  await settle();
  expect(received).toHaveLength(1);

  disconnectA();
  await settle();
}
