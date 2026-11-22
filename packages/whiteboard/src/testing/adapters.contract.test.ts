import { describe, it } from 'vitest';
import {
  expectAssetsContract,
  expectPersistenceContract,
  expectTransportContract,
} from './contracts';
import {
  createMemoryAssets,
  createMemoryPersistence,
  createMemoryTransportHub,
} from './memory-adapters';

describe('reference adapters satisfy the adapter contracts', () => {
  it('WhiteboardPersistence', async () => {
    await expectPersistenceContract(createMemoryPersistence());
  });

  it('WhiteboardAssets', async () => {
    await expectAssetsContract(createMemoryAssets());
  });

  it('WhiteboardTransport', async () => {
    const hub = createMemoryTransportHub();

    await expectTransportContract(hub.createPeer(), hub.createPeer(), () =>
      Promise.resolve()
    );
  });
});
