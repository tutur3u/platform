import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/internal-api-error';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PendingSeasonMerge,
  readPendingSeasonMerge,
} from './season-merge-recovery';
import { useSeasonMergeRecovery } from './use-season-merge-recovery';

const api = vi.hoisted(() => ({ apply: vi.fn() }));
vi.mock('@tuturuuu/internal-api/inventory', () => ({
  applyInventorySeasonMerge: api.apply,
}));
const request: PendingSeasonMerge = {
  actorId: 'actor-a',
  wsId: 'workspace',
  sourceName: 'Synthetic source',
  targetName: 'Synthetic target',
  payload: {
    sourceId: '11111111-1111-4111-8111-111111111111',
    targetId: '22222222-2222-4222-8222-222222222222',
    version: '33333333-3333-4333-8333-333333333333',
    descriptionPolicy: 'source',
    rulePolicy: 'target',
    pricePolicy: 'block',
  },
};
function setup(onComplete = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ actorId }) =>
      useSeasonMergeRecovery({ actorId, wsId: 'workspace', onComplete }),
    {
      initialProps: { actorId: 'actor-a' },
      wrapper,
    }
  );
  return { ...hook, client, wrapper, onComplete };
}
beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('season merge exact request recovery', () => {
  it('retains a lost-response request across remount and reconciles the exact frozen token/body', async () => {
    const receipt = {
      merged: true,
      targetId: request.payload.targetId,
      importedPriceCount: 2,
    };
    let submitted: string | undefined;
    api.apply.mockImplementation(async (_ws, body) => {
      if (!submitted) {
        submitted = JSON.stringify(body);
        throw new TypeError('response lost after synthetic commit');
      }
      expect(JSON.stringify(body)).toBe(submitted);
      return receipt;
    });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.mutation.mutate(request));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(TypeError)
    );
    expect(readPendingSeasonMerge('actor-a', 'workspace')).toEqual(request);
    hook.unmount();
    const resumed = setup();
    await waitFor(() =>
      expect(resumed.result.current.request).toEqual(request)
    );
    // The original version is intentionally reused, never refreshed/replaced.
    act(() => resumed.result.current.retry());
    await waitFor(() => expect(resumed.onComplete).toHaveBeenCalledOnce());
    expect(api.apply).toHaveBeenCalledTimes(2);
    expect(api.apply).toHaveBeenLastCalledWith('workspace', request.payload);
    expect(readPendingSeasonMerge('actor-a', 'workspace')).toBeNull();
  });
  it.each([400, 404, 409, 422])(
    'clears only definitively rejected %i requests for fresh review',
    async (status) => {
      api.apply.mockRejectedValue(
        new InternalApiError('synthetic rejection', status)
      );
      const hook = setup();
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      act(() => hook.result.current.mutation.mutate(request));
      await waitFor(() =>
        expect(hook.result.current.error).toBeInstanceOf(InternalApiError)
      );
      expect(hook.result.current.request).toBeNull();
      expect(readPendingSeasonMerge('actor-a', 'workspace')).toBeNull();
    }
  );
  it.each([401, 403, 500, 503])(
    'preserves the original request on auth/ambiguous %i',
    async (status) => {
      api.apply.mockRejectedValue(
        new InternalApiError('synthetic pause', status)
      );
      const hook = setup();
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      act(() => hook.result.current.mutation.mutate(request));
      await waitFor(() =>
        expect(hook.result.current.error).toBeInstanceOf(InternalApiError)
      );
      expect(hook.result.current.request).toEqual(request);
      expect(readPendingSeasonMerge('actor-a', 'workspace')).toEqual(request);
      expect(hook.onComplete).not.toHaveBeenCalled();
    }
  );
  it('retains an ambiguous request when retry times out with409 while the original can still commit', async () => {
    api.apply
      .mockRejectedValueOnce(new TypeError('synthetic lost response'))
      .mockRejectedValueOnce(
        new InternalApiError('synthetic lock timeout', 409)
      )
      .mockResolvedValueOnce({
        merged: true,
        targetId: request.payload.targetId,
        importedPriceCount: 0,
      });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.mutation.mutate(request));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(TypeError)
    );
    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(InternalApiError)
    );
    expect(readPendingSeasonMerge('actor-a', 'workspace')).toEqual(request);
    act(() => hook.result.current.retry());
    await waitFor(() => expect(hook.onComplete).toHaveBeenCalledOnce());
    expect(api.apply.mock.calls.map((args) => args[1])).toEqual([
      request.payload,
      request.payload,
      request.payload,
    ]);
  });
  it('does not expose or retry another actor request and ignores late completion in the new scope', async () => {
    let resolve!: (value: unknown) => void;
    api.apply.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.mutation.mutate(request));
    await waitFor(() => expect(api.apply).toHaveBeenCalledOnce());
    hook.rerender({ actorId: 'actor-b' });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    expect(hook.result.current.request).toBeNull();
    expect(hook.result.current.pending).toBe(false);
    act(() => hook.result.current.retry());
    expect(api.apply).toHaveBeenCalledOnce();
    act(() =>
      resolve({
        merged: true,
        targetId: request.payload.targetId,
        importedPriceCount: 0,
      })
    );
    await waitFor(() =>
      expect(readPendingSeasonMerge('actor-a', 'workspace')).toBeNull()
    );
    expect(hook.onComplete).not.toHaveBeenCalled();
    expect(readPendingSeasonMerge('actor-b', 'workspace')).toBeNull();
  });
  it('does not complete a remounted dialog when the old request returns after unmount', async () => {
    let resolve!: (value: unknown) => void;
    api.apply.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.mutation.mutate(request));
    await waitFor(() => expect(api.apply).toHaveBeenCalledOnce());
    hook.unmount();
    act(() =>
      resolve({
        merged: true,
        targetId: request.payload.targetId,
        importedPriceCount: 0,
      })
    );
    await waitFor(() =>
      expect(readPendingSeasonMerge('actor-a', 'workspace')).toBeNull()
    );
    expect(hook.onComplete).not.toHaveBeenCalled();
  });
  it('does not overwrite a saved unresolved request with different policies', async () => {
    sessionStorage.setItem(
      'inventory:season-merge:actor-a:workspace',
      JSON.stringify(request)
    );
    const hook = setup();
    await waitFor(() => expect(hook.result.current.request).toEqual(request));
    act(() =>
      hook.result.current.mutation.mutate({
        ...request,
        payload: { ...request.payload, rulePolicy: 'source' },
      })
    );
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(Error)
    );
    expect(api.apply).not.toHaveBeenCalled();
    expect(readPendingSeasonMerge('actor-a', 'workspace')).toEqual(request);
  });
  it('fails closed if a stored recovery record belongs to another actor', async () => {
    sessionStorage.setItem(
      'inventory:season-merge:actor-a:workspace',
      JSON.stringify({ ...request, actorId: 'actor-b' })
    );
    const hook = setup();
    await waitFor(() => expect(hook.result.current.storageError).toBe(true));
    expect(hook.result.current.request).toBeNull();
    expect(api.apply).not.toHaveBeenCalled();
  });
  it('does not send if saving the original request fails', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('synthetic quota', 'QuotaExceededError');
    });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    act(() => hook.result.current.mutation.mutate(request));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(DOMException)
    );
    expect(api.apply).not.toHaveBeenCalled();
    expect(readPendingSeasonMerge('actor-a', 'workspace')).toBeNull();
  });
});
