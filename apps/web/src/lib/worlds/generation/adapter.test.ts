import { describe, expect, test, vi } from 'vitest';
import type { GenerationAttempt } from '@tuturuuu/worlds/generation';
import {
  createWorldsGenerationProvider,
  type WorldsProviderDependencies,
  worldsProviderLimits,
} from './adapter';
import { createWorldsPrivateAssetStorage } from './private-assets';

const scope = { workspaceId: 'workspace', worldId: 'world', actorId: 'actor' };
const usage = { inputTokens: 20, outputTokens: 10, reasoningTokens: 2 };
function attempt(signal = new AbortController().signal): GenerationAttempt {
  return {
    request: {
      workspaceId: scope.workspaceId,
      worldId: scope.worldId,
      requestId: 'request',
      kind: 'prompt',
      instruction: 'Add a stage',
    },
    attempt: 1,
    signal,
  };
}

function setup() {
  const claimed = new Set<string>();
  const deps = {
    ledger: {
      claim: vi.fn(async (key: { requestId: string }) => {
        if (claimed.has(key.requestId)) return false;
        claimed.add(key.requestId);
        return true;
      }),
      recordReservation: vi.fn(async () => {}),
      recordUsage: vi.fn(async () => {}),
    },
    reserve: vi.fn(async () => ({
      id: 'hold',
      modelId: 'model',
      maxOutputTokens: 1024,
    })),
    generate: vi.fn<WorldsProviderDependencies['generate']>(async () => ({
      draft: {},
      usage,
    })),
    settle: vi.fn(async () => true),
    release: vi.fn(async () => {}),
  };
  return { deps, provider: createWorldsGenerationProvider(scope, deps) };
}

describe('Worlds provider', () => {
  test('dispatches at most once across concurrent and later attempts', async () => {
    const { deps, provider } = setup();
    const input = attempt();
    const results = await Promise.all([
      provider.generate(input),
      provider.generate({ ...input, attempt: 2 }),
    ]);
    expect(results).toContainEqual({ kind: 'draft', draft: {} });
    expect(results).toContainEqual({ kind: 'failure', retryable: false });
    expect(await provider.generate({ ...input, attempt: 3 })).toEqual({
      kind: 'failure',
      retryable: false,
    });
    expect(deps.reserve).toHaveBeenCalledTimes(1);
    expect(deps.generate).toHaveBeenCalledTimes(1);
    expect(deps.ledger.recordUsage).toHaveBeenCalledTimes(1);
    expect(deps.settle).toHaveBeenCalledTimes(1);
  });

  test('keeps an ambiguous provider outcome fenced without releasing its hold', async () => {
    const { deps, provider } = setup();
    deps.generate.mockRejectedValueOnce(new Error('transport lost'));
    const input = attempt();
    await provider.generate(input);
    await provider.generate({ ...input, attempt: 2 });
    expect(deps.release).not.toHaveBeenCalled();
    expect(deps.settle).not.toHaveBeenCalled();
    expect(deps.generate).toHaveBeenCalledTimes(1);
  });

  test('checkpoints actual usage when settlement is ambiguous and suppresses publication', async () => {
    const { deps, provider } = setup();
    deps.settle.mockRejectedValueOnce(new Error('response lost'));
    const input = attempt();
    expect(await provider.generate(input)).toEqual({
      kind: 'failure',
      retryable: false,
    });
    await provider.generate({ ...input, attempt: 2 });
    expect(deps.ledger.recordUsage).toHaveBeenCalledTimes(1);
    expect(deps.settle).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
  });

  test('releases the hold when cancelled before dispatch', async () => {
    const { deps, provider } = setup();
    const controller = new AbortController();
    deps.ledger.recordReservation.mockImplementationOnce(async () => {
      controller.abort();
    });
    await provider.generate(attempt(controller.signal));
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledTimes(1);
  });

  test('settles reported usage when cancelled during dispatch without returning a draft', async () => {
    const { deps, provider } = setup();
    const controller = new AbortController();
    deps.generate.mockImplementationOnce(async ({ signal }) => {
      controller.abort();
      expect(signal.aborted).toBe(true);
      return { draft: {}, usage };
    });
    expect(await provider.generate(attempt(controller.signal))).toEqual({
      kind: 'failure',
      retryable: false,
    });
    expect(deps.settle).toHaveBeenCalledTimes(1);
    expect(deps.release).not.toHaveBeenCalled();
  });

  test('validates attachment type, size and scope before acquiring a hold', async () => {
    const { deps, provider } = setup();
    const base = attempt();
    const bytes = new Uint8Array(worldsProviderLimits.textBytes + 1);
    await provider.generate(
      {
        ...base,
        request: {
          ...base.request,
          kind: 'file',
          source: {
            id: 'upload',
            mediaType: 'text/plain',
            byteLength: bytes.length,
          },
        },
      },
      bytes
    );
    await provider.generate({
      ...base,
      request: { ...base.request, workspaceId: 'other' },
    });
    expect(deps.ledger.claim).not.toHaveBeenCalled();
  });

  test('passes bounded UTF-8 attachments as reference text', async () => {
    const { deps, provider } = setup();
    const base = attempt();
    const bytes = new TextEncoder().encode('venue layout');
    await provider.generate(
      {
        ...base,
        request: {
          ...base.request,
          kind: 'file',
          source: {
            id: 'upload',
            mediaType: 'text/plain',
            byteLength: bytes.length,
          },
        },
      },
      bytes
    );
    expect(deps.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: { kind: 'text', text: 'venue layout' },
      })
    );
  });

  test('passes an in-bounds PNG and rejects oversize dimensions before reservation', async () => {
    const { deps, provider } = setup();
    const base = attempt();
    const bytes = new Uint8Array(33);
    const header = new DataView(bytes.buffer);
    header.setUint32(0, 0x89504e47);
    header.setUint32(4, 0x0d0a1a0a);
    header.setUint32(8, 13);
    header.setUint32(12, 0x49484452);
    header.setUint32(16, worldsProviderLimits.imageSide + 1);
    header.setUint32(20, 1);
    const input = {
      ...base,
      request: {
        ...base.request,
        kind: 'image' as const,
        source: {
          id: 'upload',
          mediaType: 'image/png',
          byteLength: bytes.length,
        },
      },
    };
    await provider.generate(input, bytes);
    expect(deps.reserve).not.toHaveBeenCalled();
    header.setUint32(16, 1);
    await provider.generate(input, bytes);
    expect(deps.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: { kind: 'image', data: bytes },
      })
    );
  });
});

describe('private upload reader', () => {
  test('accepts one-byte chunks within the declared upload length', async () => {
    const base = attempt();
    const bytes = new Uint8Array(2048).fill(65);
    const source = {
      id: 'upload',
      mediaType: 'text/plain',
      byteLength: bytes.length,
    };
    const request = { ...base.request, kind: 'file' as const, source };
    const storage = createWorldsPrivateAssetStorage(scope, async () => ({
      ...source,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      }),
    }));

    expect(await storage.read({ ...base, request }, source)).toEqual(bytes);
  });

  test('opens only bound references and cancels overflow', async () => {
    const base = attempt();
    const source = { id: 'upload', mediaType: 'text/plain', byteLength: 2 };
    const request = { ...base.request, kind: 'file' as const, source };
    const cancel = vi.fn(() => {});
    const open = vi.fn(async () => ({
      mediaType: source.mediaType,
      byteLength: source.byteLength,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(3));
        },
        cancel,
      }),
    }));
    const storage = createWorldsPrivateAssetStorage(scope, open);
    expect(
      await storage.read(
        { ...base, request: { ...request, worldId: 'other' } },
        source
      )
    ).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(await storage.read({ ...base, request }, source)).toBeNull();
    expect(open).toHaveBeenCalledWith(scope, source.id, base.signal);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
