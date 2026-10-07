import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { UIMessage } from '@tuturuuu/ai/types';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraSoulScopeProvider } from '@/components/mira-soul-scope';
import { useMiraChatEffects } from '../use-mira-chat-effects';

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));
const clients: QueryClient[] = [];
afterEach(() =>
  clients.splice(0).forEach((client) => {
    client.clear();
  })
);
function message(
  output: unknown,
  extra: Record<string, unknown> = {},
  id = 'current-assistant'
): UIMessage {
  return {
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-update_my_settings',
        toolCallId: 'settings-call',
        state: 'output-available',
        input: { name: 'Custom' },
        output,
        ...extra,
      },
    ],
  } as UIMessage;
}
function harness() {
  const client = new QueryClient();
  clients.push(client);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  function Effects({
    messages,
    status,
    wsId,
    chatId,
  }: {
    messages: UIMessage[];
    status: string;
    wsId: string;
    chatId: string;
  }) {
    useMiraChatEffects({
      messages,
      status,
      wsId,
      chatId,
      queryClient: client,
      routerRefresh: vi.fn(),
      setMessageAttachments: vi.fn(),
      setWorkspaceContextId: vi.fn(),
      messageAttachmentsRef: { current: new Map() },
    });
    return null;
  }
  const props = (
    messages: UIMessage[],
    status = 'streaming',
    wsId = 'workspace-a',
    actor = 'actor-a',
    chatId = 'chat-a'
  ) => (
    <QueryClientProvider client={client}>
      <MiraSoulScopeProvider key={actor} actorId={actor}>
        <Effects
          messages={messages}
          status={status}
          wsId={wsId}
          chatId={chatId}
        />
      </MiraSoulScopeProvider>
    </QueryClientProvider>
  );
  return { invalidate, props };
}
it.each([
  [{ success: false }, {}],
  [{ success: true, error: 'denied' }, {}],
  [{ success: true }, { preliminary: true }],
  [{ success: true, preliminary: true }, {}],
])(
  'does not refresh Soul for a nondefinitive current receipt %j',
  async (output, extra) => {
    const { invalidate, props } = harness();
    const view = render(props([], 'ready'));
    view.rerender(props([], 'submitted'));
    await act(async () => view.rerender(props([message(output, extra)])));
    expect(
      invalidate.mock.calls.filter(
        ([options]) => options?.queryKey?.[0] === 'mira-soul'
      )
    ).toHaveLength(0);
  }
);
it('refreshes only the current actor once for a current definitive receipt', async () => {
  const { invalidate, props } = harness();
  const view = render(props([], 'ready'));
  view.rerender(props([], 'submitted'));
  await act(async () => view.rerender(props([message({ success: true })])));
  await act(async () =>
    view.rerender(props([message({ success: true })], 'ready'))
  );
  expect(
    invalidate.mock.calls.filter(
      ([options]) => options?.queryKey?.[0] === 'mira-soul'
    )
  ).toEqual([[{ queryKey: ['mira-soul', 'detail', 'actor-a'], exact: true }]]);
});
it('never replays a restored settings receipt on the next turn', async () => {
  const { invalidate, props } = harness();
  const history = [message({ success: true }, {}, 'history-assistant')];
  const view = render(props(history, 'ready'));
  await act(async () => view.rerender(props(history, 'submitted')));
  view.rerender(props(history));
  expect(
    invalidate.mock.calls.filter(
      ([options]) => options?.queryKey?.[0] === 'mira-soul'
    )
  ).toHaveLength(0);
});
it.each(['actor', 'workspace', 'chat'])(
  'rejects an old receipt after committed %s ABA',
  async (departure) => {
    const { invalidate, props } = harness();
    const view = render(props([], 'ready'));
    view.rerender(props([], 'submitted'));
    view.rerender(
      props(
        [],
        'streaming',
        departure === 'workspace' ? 'workspace-b' : 'workspace-a',
        departure === 'actor' ? 'actor-b' : 'actor-a',
        departure === 'chat' ? 'chat-b' : 'chat-a'
      )
    );
    await act(async () => view.rerender(props([message({ success: true })])));
    expect(
      invalidate.mock.calls.filter(
        ([options]) => options?.queryKey?.[0] === 'mira-soul'
      )
    ).toHaveLength(0);
  }
);
