import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryServiceHttpError } from './client';
import { editAiMemory } from './edit';
import { resolveAiMemoryScope } from './scope';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  embed: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  getAiMemoryServiceClient: () => ({
    readEditableMemory: mocks.read,
    updateEditableMemory: mocks.update,
  }),
}));
vi.mock('./settings', () => ({
  isAiMemoryEnabledForScope: mocks.enabled,
  disableAiMemoryForMeteringFailure: vi.fn(),
}));
vi.mock('../embeddings/metered', () => ({
  createMeteredTextEmbedding: mocks.embed,
  shouldDisableMemoryForMeteringReason: () => false,
}));
const scope = resolveAiMemoryScope({
  product: 'mira',
  source: 'memory_controls',
  surface: 'memory_controls',
  userId: 'actor-a',
  wsId: 'workspace-a',
})!;
const revision = `v1:${'a'.repeat(32)}`;
const nextRevision = `v1:${'b'.repeat(32)}`;
const original = {
  id: 'memory-a',
  content: 'Original',
  status: 'done',
  revision,
  customId: 'original-source',
  metadata: {
    userId: scope.userId,
    wsId: scope.wsId,
    product: scope.product,
    source: 'original-event',
  },
};
const args = { scope, memoryId: original.id, revision, value: 'Edited' };

describe('scoped in-place memory edits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.enabled.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ memory: original });
    mocks.embed.mockResolvedValue({
      ok: true,
      embedding: Array.from({ length: 3072 }, () => 0.1),
    });
    mocks.update.mockResolvedValue({
      updated: true,
      memory: { ...original, content: 'Edited', revision: nextRevision },
    });
  });
  it('preserves identity/provenance and preflights scope before embedding then CAS update', async () => {
    const result = await editAiMemory(args);
    expect(result).toMatchObject({
      ok: true,
      memory: {
        id: original.id,
        customId: original.customId,
        metadata: original.metadata,
        revision: nextRevision,
      },
    });
    expect(mocks.read).toHaveBeenCalledWith({
      id: original.id,
      containerTag: scope.containerTag,
      userId: scope.userId,
      wsId: scope.wsId,
      product: scope.product,
    });
    expect(mocks.read.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.embed.mock.invocationCallOrder[0]!
    );
    expect(mocks.embed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.update.mock.invocationCallOrder[0]!
    );
    expect(mocks.update.mock.calls[0]![0]).toMatchObject({
      revision,
      content: 'Edited',
      id: original.id,
    });
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty('metadata');
    expect(mocks.update.mock.calls[0]![0]).not.toHaveProperty('customId');
  });
  for (const change of [
    { id: 'other-id' },
    { status: 'forgotten' },
    { metadata: { ...original.metadata, userId: 'actor-b' } },
    { metadata: { ...original.metadata, wsId: 'workspace-b' } },
    { metadata: { ...original.metadata, product: 'ai_chat' } },
  ]) {
    it(`denies foreign or inactive preflight before embedding ${JSON.stringify(change)}`, async () => {
      mocks.read.mockResolvedValue({ memory: { ...original, ...change } });
      expect(await editAiMemory(args)).toEqual({
        ok: false,
        reason: 'not_found',
      });
      expect(mocks.embed).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  }
  it('rejects stale revision before any metered work', async () => {
    mocks.read.mockResolvedValue({
      memory: { ...original, revision: nextRevision },
    });
    expect(await editAiMemory(args)).toEqual({ ok: false, reason: 'conflict' });
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reports race conflict after embedding honestly and old-revision retry adds no charge', async () => {
    mocks.update.mockRejectedValue(new AiMemoryServiceHttpError(409));
    expect(await editAiMemory(args)).toEqual({ ok: false, reason: 'conflict' });
    expect(mocks.embed).toHaveBeenCalledOnce();
    mocks.read.mockResolvedValue({
      memory: { ...original, revision: nextRevision },
    });
    expect(await editAiMemory(args)).toEqual({ ok: false, reason: 'conflict' });
    expect(mocks.embed).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
  });
  it('embedding failure leaves the original untouched', async () => {
    mocks.embed.mockResolvedValue({ ok: false, reason: 'reservation_failed' });
    expect(await editAiMemory(args)).toEqual({
      ok: false,
      reason: 'embedding_failed',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('missing memory never triggers embedding', async () => {
    mocks.read.mockRejectedValue(new AiMemoryServiceHttpError(404));
    expect(await editAiMemory(args)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(mocks.embed).not.toHaveBeenCalled();
  });
  it('service update failure is not reported as success or raw provider content', async () => {
    mocks.update.mockRejectedValue(new Error('Synthetic private payload'));
    expect(await editAiMemory(args)).toEqual({
      ok: false,
      reason: 'service_failed',
    });
  });
  it('rejects incomplete update receipts', async () => {
    mocks.update.mockResolvedValue({ updated: false, memory: original });
    expect(await editAiMemory(args)).toEqual({
      ok: false,
      reason: 'service_failed',
    });
  });
  it('collection consent gates default edits while explicit management bypass stays opt-in', async () => {
    mocks.enabled.mockResolvedValue(false);
    expect(await editAiMemory(args)).toEqual({ ok: false, reason: 'disabled' });
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.embed).not.toHaveBeenCalled();
    expect(await editAiMemory({ ...args, ignoreSettings: true })).toMatchObject(
      { ok: true }
    );
    expect(mocks.embed).toHaveBeenCalledOnce();
  });
  for (const change of [
    { customId: 'replaced-provenance' },
    { metadata: { ...original.metadata, source: 'replaced-event' } },
    { revision },
  ]) {
    it(`rejects an unconfirmed provenance/revision receipt ${JSON.stringify(change)}`, async () => {
      mocks.update.mockResolvedValue({
        updated: true,
        memory: {
          ...original,
          content: 'Edited',
          revision: nextRevision,
          ...change,
        },
      });
      expect(await editAiMemory(args)).toEqual({
        ok: false,
        reason: 'service_failed',
      });
    });
  }
  it('same-content edit still requires an advancing revision receipt', async () => {
    mocks.update.mockResolvedValue({
      updated: true,
      memory: { ...original, revision: nextRevision },
    });
    expect(
      await editAiMemory({ ...args, value: original.content })
    ).toMatchObject({ ok: true, memory: { revision: nextRevision } });
    mocks.update.mockResolvedValue({ updated: true, memory: original });
    expect(await editAiMemory({ ...args, value: original.content })).toEqual({
      ok: false,
      reason: 'service_failed',
    });
  });
  it('metadata key ordering alone does not change provenance', async () => {
    mocks.update.mockResolvedValue({
      updated: true,
      memory: {
        ...original,
        content: 'Edited',
        revision: nextRevision,
        metadata: Object.fromEntries(
          Object.entries(original.metadata).reverse()
        ),
      },
    });
    expect(await editAiMemory(args)).toMatchObject({ ok: true });
  });
});
