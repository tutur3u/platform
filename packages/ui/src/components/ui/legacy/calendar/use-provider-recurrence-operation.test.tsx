import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  read: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/calendar-provider-series', () => ({
  reserveCalendarProviderSeriesOperation: mocks.reserve,
  getCalendarProviderSeriesOperation: mocks.read,
  retryCalendarProviderSeriesOperation: mocks.retry,
}));

import { useProviderRecurrenceOperation } from './use-provider-recurrence-operation';

const clients: QueryClient[] = [];
const payload = {
  requestId: '11111111-1111-4111-8111-111111111111',
  action: 'create' as const,
  source: { provider: 'google' as const, connectionId: 'connection' },
  rule: {
    version: 1 as const,
    timeZone: 'UTC',
    frequency: 'daily' as const,
    interval: 1,
    end: { type: 'never' as const },
  },
  anchor: {
    startLocal: '2026-10-06T09:00:00',
    endLocal: '2026-10-06T10:00:00',
    allDay: false,
  },
  event: { title: 'Test series' },
};
function setup(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  actorId = 'actor'
) {
  clients.push(client);
  const applied = vi.fn(),
    assertActive = vi.fn();
  const actor = {
    actorId,
    lifetime: { active: true },
    assertActive,
  } as Parameters<typeof useProviderRecurrenceOperation>[0]['actor'];
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useProviderRecurrenceOperation({
        wsId: 'workspace',
        actor,
        identity: 'new',
        onApplied: applied,
      }),
    { wrapper }
  );
  return { ...hook, client, applied, assertActive };
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.read.mockResolvedValue({
    operationId: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
  });
  mocks.reserve.mockResolvedValue({
    operationId: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
  });
  mocks.retry.mockResolvedValue({
    operationId: '11111111-1111-4111-8111-111111111111',
    status: 'pending',
  });
});
afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});
describe('recoverable provider operation UI state', () => {
  it('does not finish a pending reservation and retries the exact confirmed operation', async () => {
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.result.current.pending).toBe(true));
    await waitFor(() =>
      expect(h.result.current.submission.isSuccess).toBe(true)
    );
    expect(h.applied).not.toHaveBeenCalled();
    act(() => h.result.current.retry());
    await waitFor(() =>
      expect(mocks.retry).toHaveBeenCalledWith(
        'workspace',
        '11111111-1111-4111-8111-111111111111'
      )
    );
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    h.unmount();
  });
  it('retains an ambiguous admission across dialog dismissal and never creates a new intent', async () => {
    mocks.reserve.mockRejectedValue(new Error('Response lost'));
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.result.current.submission.isError).toBe(true));
    h.unmount();
    const reopened = setup(h.client);
    expect(reopened.result.current.pending).toBe(true);
    mocks.reserve.mockResolvedValue({
      operationId: '11111111-1111-4111-8111-111111111111',
      status: 'pending',
    });
    act(() => reopened.result.current.retry());
    await waitFor(() => expect(mocks.reserve).toHaveBeenCalledTimes(2));
    expect(mocks.reserve.mock.calls[1]).toEqual(['workspace', payload]);
    reopened.unmount();
  });
  it('finishes only a matching applied receipt and clears the retained intent', async () => {
    mocks.reserve.mockResolvedValue({
      operationId: '11111111-1111-4111-8111-111111111111',
      status: 'applied',
      result: {},
    });
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.applied).toHaveBeenCalledTimes(1));
    expect(h.result.current.pending).toBe(false);
    h.unmount();
  });

  it('recovers only the operation UUID after reload without persisting event contents', async () => {
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() =>
      expect(h.result.current.submission.isSuccess).toBe(true)
    );
    expect(JSON.stringify(sessionStorage)).not.toContain('Test series');
    h.unmount();
    const restored = setup();
    expect(restored.result.current.pending).toBe(true);
    act(() => restored.result.current.retry());
    await waitFor(() =>
      expect(mocks.retry).toHaveBeenCalledWith('workspace', payload.requestId)
    );
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    restored.unmount();
  });

  it('releases a completed preflight rejection only after an authoritative absent operation', async () => {
    mocks.reserve.mockRejectedValue(new InternalApiError('Unsupported', 422));
    mocks.read.mockRejectedValue(new InternalApiError('Absent', 404));
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.result.current.submission.isError).toBe(true));
    expect(h.result.current.pending).toBe(false);
    expect(sessionStorage.length).toBe(0);
    h.unmount();
  });
  it('blocks dispatch when UUID recovery storage is unavailable', async () => {
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Storage denied');
      });
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.result.current.submission.isError).toBe(true));
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(h.result.current.pending).toBe(false);
    h.unmount();
    storage.mockRestore();
  });
  it('does not carry another actor’s pending draft into the new session', async () => {
    const h = setup();
    act(() => h.result.current.submission.mutate(payload));
    await waitFor(() => expect(h.result.current.pending).toBe(true));
    h.unmount();
    const other = setup(h.client, 'another-actor');
    expect(other.result.current.pending).toBe(false);
    other.unmount();
  });
});
