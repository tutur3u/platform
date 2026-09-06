import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { EventEmitter } from 'eventemitter3';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  workspace: vi.fn(),
  respond: vi.fn(),
  client: null as unknown,
}));
vi.mock('@tuturuuu/internal-api', () => ({ executeLiveTool: mocks.execute }));
vi.mock('./live-workspace-tools', () => ({
  executeWorkspaceLiveTool: mocks.workspace,
  LIVE_MUTATION_TOOLS: new Set([
    'create_task',
    'update_task',
    'delete_task',
    'create_calendar_event',
  ]),
}));
vi.mock('@/hooks/use-live-api', () => ({
  useLiveAPIContext: () => ({
    client: mocks.client,
    connected: true,
    sendToolResponse: mocks.respond,
  }),
}));

import { useLiveTools } from './use-live-tools';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}
let client: EventEmitter & { ws: object };
const call = (id: string, name: string) => ({
  id,
  name,
  args: { name: 'Review' },
});
describe('live tool approval and cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client = Object.assign(new EventEmitter(), { ws: {} });
    mocks.client = client;
    mocks.workspace.mockResolvedValue(null);
    mocks.execute.mockResolvedValue({ result: { success: true } });
  });
  it('waits for explicit approval and deduplicates calls', async () => {
    const { result } = renderHook(() => useLiveTools('workspace-a'), {
      wrapper,
    });
    act(() => {
      client.emit('toolcall', { functionCalls: [call('1', 'create_task')] });
    });
    await waitFor(() =>
      expect(result.current.activities[0]?.status).toBe('approval')
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    act(() => result.current.decide('1', true));
    await waitFor(() => expect(mocks.respond).toHaveBeenCalledOnce());
    expect(mocks.execute).toHaveBeenCalledWith(
      {
        wsId: 'workspace-a',
        functionName: 'create_task',
        args: { name: 'Review' },
      },
      expect.anything()
    );
    act(() => {
      client.emit('toolcall', { functionCalls: [call('1', 'create_task')] });
    });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it('declining never invokes a mutation', async () => {
    const { result } = renderHook(() => useLiveTools('workspace-a'), {
      wrapper,
    });
    act(() => {
      client.emit('toolcall', { functionCalls: [call('2', 'delete_task')] });
    });
    act(() => result.current.decide('2', false));
    await waitFor(() => expect(mocks.respond).toHaveBeenCalledOnce());
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('cancels queued calls and suppresses late results', async () => {
    let resolve!: (value: unknown) => void;
    mocks.execute.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { result } = renderHook(() => useLiveTools('workspace-a'), {
      wrapper,
    });
    act(() => {
      client.emit('toolcall', {
        functionCalls: [call('3', 'get_my_tasks'), call('4', 'create_task')],
      });
    });
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledOnce());
    act(() => {
      client.emit('toolcallcancellation', { ids: ['3', '4'] });
    });
    await act(async () => resolve({ result: { success: true } }));
    expect(mocks.respond).not.toHaveBeenCalled();
    expect(
      result.current.activities.some((item) => item.status === 'approval')
    ).toBe(false);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it('unmount releases approvals without execution', async () => {
    const { unmount } = renderHook(() => useLiveTools('workspace-a'), {
      wrapper,
    });
    act(() => {
      client.emit('toolcall', { functionCalls: [call('5', 'create_task')] });
    });
    unmount();
    await act(async () => Promise.resolve());
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.respond).not.toHaveBeenCalled();
  });
});
