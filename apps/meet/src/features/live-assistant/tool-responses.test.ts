import type { Session } from '@google/genai/web';
import { expect, it, vi } from 'vitest';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import {
  queueLiveToolResponse,
  replayLiveToolResponses,
} from '../../../cloudflare/live/tool-responses';

it('persists an approved result before delivery and replays data after a transport failure', async () => {
  const saved = {} as unknown as SavedSession;
  const order: string[] = [];
  const persist = vi.fn(async () => {
    order.push('persist');
  });
  const broken = {
    sendToolResponse: () => {
      order.push('send');
      throw new Error('closed');
    },
  } as unknown as Session;
  await queueLiveToolResponse(
    saved,
    broken,
    {
      id: 'once',
      name: 'workspace_tool',
      response: { taskId: 'created-task' },
    },
    persist
  );
  expect(order).toEqual(['persist', 'send', 'persist']);
  expect(saved.toolResponses?.[0]?.deliveredAt).toBeUndefined();
  const sendRealtimeInput = vi.fn();
  replayLiveToolResponses(saved, { sendRealtimeInput } as unknown as Session);
  expect(sendRealtimeInput.mock.calls[0]?.[0].text).toContain('created-task');
  expect(sendRealtimeInput.mock.calls[0]?.[0].text).toContain(
    'Do not execute these operations again'
  );
  expect(saved.toolResponses?.[0]?.deliveredAt).toBeTypeOf('number');
});

it('retains a result completed while there is no provider connection', async () => {
  const saved = {} as unknown as SavedSession;
  await queueLiveToolResponse(
    saved,
    undefined,
    { id: 'once', name: 'remember', response: { saved: true } },
    async () => {}
  );
  expect(saved.toolResponses).toHaveLength(1);
  expect(saved.toolResponses?.[0]?.response).toEqual({ saved: true });
});

it('does not acknowledge outcomes omitted from a bounded replay batch', () => {
  const saved = {
    toolResponses: [
      {
        id: 'first',
        name: 'workspace_tool',
        response: { result: 'a'.repeat(30000) },
      },
      {
        id: 'second',
        name: 'workspace_tool',
        response: { result: 'b'.repeat(30000) },
      },
    ],
  } as unknown as SavedSession;
  replayLiveToolResponses(saved, {
    sendRealtimeInput: vi.fn(),
  } as unknown as Session);
  expect(saved.toolResponses?.[0]?.deliveredAt).toBeTypeOf('number');
  expect(saved.toolResponses?.[1]?.deliveredAt).toBeUndefined();
});

it('closes a failed replay transport and retains the undelivered outcome', () => {
  const saved = {
    toolResponses: [
      { id: 'once', name: 'remember', response: { saved: true } },
    ],
  } as unknown as SavedSession;
  const close = vi.fn();
  expect(() =>
    replayLiveToolResponses(saved, {
      sendRealtimeInput: () => {
        throw new Error('closed');
      },
      close,
    } as unknown as Session)
  ).toThrow('closed');
  expect(close).toHaveBeenCalledOnce();
  expect(saved.toolResponses?.[0]?.deliveredAt).toBeUndefined();
});
