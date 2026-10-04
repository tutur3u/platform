import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InventorySessionScope } from './inventory-session-scope';
import { savePendingSeasonMerge } from './season-merge-recovery';
import { useInventorySeasonMergeReview } from './use-inventory-season-merge-review';

const api = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
vi.mock('@tuturuuu/internal-api/inventory', () => ({
  previewInventorySeasonMerge: api.preview,
  applyInventorySeasonMerge: api.apply,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { success: vi.fn() } }));
const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const token = '33333333-3333-4333-8333-333333333333';
const preview = {
  version: token,
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  source: { name: 'Synthetic source' },
  target: { name: 'Synthetic target' },
  sourceRules: [],
  targetRules: [],
  futurePrices: [],
  conflicts: [],
  blockers: [],
  sourceRuleConflictCount: 0,
  targetRuleConflictCount: 0,
  conflictCount: 0,
  hasMore: true,
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let actorId = 'actor-a';
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <InventorySessionScope actorId={actorId}>
        {children}
      </InventorySessionScope>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useInventorySeasonMergeReview({
        wsId: 'workspace',
        onComplete: vi.fn().mockResolvedValue(undefined),
        onPending: vi.fn(),
      }),
    { wrapper }
  );
  return {
    ...hook,
    client,
    switchActor: () => {
      actorId = 'actor-b';
      hook.rerender();
    },
  };
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => cleanup());
it('scopes preview and paged caches by authenticated actor and hides old review during switch', async () => {
  api.preview.mockResolvedValue(preview);
  const hook = setup();
  await waitFor(() => expect(hook.result.current.recovery.loading).toBe(false));
  act(() => {
    hook.result.current.setSourceId(sourceId);
    hook.result.current.setTargetId(targetId);
  });
  await waitFor(() => expect(hook.result.current.data?.version).toBe(token));
  act(() => hook.result.current.setPage(2));
  await waitFor(() =>
    expect(api.preview).toHaveBeenLastCalledWith(
      'workspace',
      expect.objectContaining({ version: token, page: 2 })
    )
  );
  expect(
    hook.client
      .getQueryCache()
      .findAll()
      .filter((q) =>
        ['season-merge', 'season-merge-page'].includes(String(q.queryKey[2]))
      )
      .every((q) => q.queryKey[3] === 'actor-a')
  ).toBe(true);
  api.preview.mockImplementation(() => new Promise(() => {}));
  hook.switchActor();
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.confirmed).toBeNull();
  expect(hook.result.current.sourceId).toBe('');
  act(() => {
    hook.result.current.setSourceId(sourceId);
    hook.result.current.setTargetId(targetId);
  });
  await waitFor(() =>
    expect(
      hook.client
        .getQueryCache()
        .findAll()
        .some(
          (q) => q.queryKey[2] === 'season-merge' && q.queryKey[3] === 'actor-b'
        )
    ).toBe(true)
  );
  expect(hook.result.current.data).toBeUndefined();
});
it('recovers an original operation without requesting a fresh preview of an archived source', async () => {
  savePendingSeasonMerge({
    actorId: 'actor-a',
    wsId: 'workspace',
    sourceName: 'Synthetic source',
    targetName: 'Synthetic target',
    payload: {
      sourceId,
      targetId,
      version: token,
      descriptionPolicy: 'source',
      rulePolicy: 'target',
      pricePolicy: 'block',
    },
  });
  const hook = setup();
  await waitFor(() =>
    expect(hook.result.current.recovery.request?.payload.version).toBe(token)
  );
  act(() => {
    hook.result.current.setSourceId(sourceId);
    hook.result.current.setTargetId(targetId);
    hook.result.current.refresh();
  });
  expect(api.preview).not.toHaveBeenCalled();
  expect(hook.result.current.ready).toBe(false);
});
