import type {
  StoredWhiteboardSnapshot,
  WhiteboardAssets,
  WhiteboardPersistence,
  WhiteboardTransport,
  WhiteboardTransportHandlers,
} from '../adapters';

/** In-memory persistence with a counter revision; the reference implementation. */
export function createMemoryPersistence(): WhiteboardPersistence {
  let stored: StoredWhiteboardSnapshot = { snapshot: null, revision: null };
  let counter = 0;

  return {
    async load() {
      return stored;
    },
    async save(snapshot) {
      counter += 1;
      stored = { snapshot, revision: `r${counter}` };
      return { revision: stored.revision };
    },
  };
}

export function createMemoryAssets(): WhiteboardAssets {
  const files = new Map<string, string>();

  return {
    async upload(file) {
      const id = `file-${files.size + 1}-${file.name}`;
      files.set(id, `memory://${id}`);
      return id;
    },
    async resolveUrl(fileId) {
      return files.get(fileId) ?? null;
    },
  };
}

/** Peers created from one hub deliver to each other, never to themselves. */
export function createMemoryTransportHub() {
  const peers = new Set<WhiteboardTransportHandlers>();

  const createPeer = (): WhiteboardTransport => {
    let own: WhiteboardTransportHandlers | null = null;
    const others = () => [...peers].filter((peer) => peer !== own);

    return {
      connect(handlers) {
        own = handlers;
        peers.add(handlers);
        handlers.onStatus('connected');
        return () => {
          peers.delete(handlers);
          own = null;
        };
      },
      async sendElementChanges(batch) {
        for (const peer of others()) peer.onElementChanges(batch);
      },
      async sendCursor(update) {
        for (const peer of others()) peer.onCursor(update);
      },
      async sendSelection(update) {
        for (const peer of others()) peer.onSelection(update);
      },
    };
  };

  return { createPeer };
}
