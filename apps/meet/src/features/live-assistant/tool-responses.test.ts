import type { Session } from '@google/genai/web';
import { expect, it, vi } from 'vitest';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import {
  queueLiveToolResponse,
  replayLiveToolResponses,
} from '../../../cloudflare/live/tool-responses';

it('persists an approved result before delivery and replays data after a transport failure', async () => {
  const saved = {} as SavedSession;
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
    'do not execute these operations again'
  );
  expect(saved.toolResponses?.[0]?.deliveredAt).toBeTypeOf('number');
});

it('retains a result completed while there is no provider connection', async () => {
  const saved = {} as SavedSession;
  await queueLiveToolResponse(
    saved,
    undefined,
    { id: 'once', name: 'remember', response: { saved: true } },
    async () => {}
  );
  expect(saved.toolResponses).toHaveLength(1);
  expect(saved.toolResponses?.[0]?.response).toEqual({ saved: true });
});
