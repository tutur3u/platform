import '@testing-library/jest-dom/vitest';
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement as h } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  meetMailFragment,
  type MeetMailHandoff,
} from '@tuturuuu/utils/meet-mail-handoff';
import { MeetMailWorkspaceScope } from './meet-mail-workspace-scope';
import { MailActorProvider } from '@/components/mail-actor-provider';
import { ConnectedMailClient } from './connected-mail-client';
import { MailAppClient } from './mail-client';
const api = vi.hoisted(() => ({
  request: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  role: 'owner',
}));
const actorId = '00000000-0000-4000-8000-000000000001',
  workspaceId = '00000000-0000-4000-8000-000000000002';
vi.mock('@tuturuuu/internal-api', () => ({
  connectedMailRequest: api.request,
  getMailBootstrap: async () => ({
    mailboxes: [
      {
        id: 'box',
        address: 'me@example.invalid',
        role: api.role,
        status: 'active',
        providerLimits: { maxRecipients: 50, maxMessageBytes: 5_000_000 },
        signatureHtml: null,
        signatureText: null,
      },
    ],
    labels: [],
    user: { id: actorId, email: 'me@example.invalid' },
  }),
  getMailUnreadCounts: async () => ({ box: 0 }),
  listMailThreads: async () => ({
    threads: [],
    pagination: { page: 1, pageSize: 40, total: 0, hasMore: false },
  }),
  listWorkspaceMembers: async () => [],
  getMailInvitation: async () => ({ invitation: null }),
  bulkUpdateMailThreads: vi.fn(),
  deleteMailDraft: vi.fn(),
  getMailThread: vi.fn(),
  updateMailThreadState: vi.fn(),
  createMailDraft: api.create,
  updateMailDraft: api.create,
  sendMailMessage: api.send,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@tuturuuu/ui/resizable', () => ({
  ResizablePanelGroup: () => null,
  ResizablePanel: () => null,
  ResizableHandle: () => null,
}));
const handoff = (): MeetMailHandoff => ({
  v: 1,
  source: 'meet',
  id: crypto.randomUUID(),
  issuedAt: Date.now(),
  actorId,
  workspaceId,
  subject: '<b>Plain title</b>',
  joinUrl: 'https://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
  body: '<b>Plain title</b>\nhttps://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
  to: ['guest@example.invalid'],
});
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  api.role = 'owner';
  window.history.replaceState(
    {},
    '',
    '/en/' + workspaceId + '/inbox' + meetMailFragment(handoff())
  );
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => unknown) => callback(),
    },
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  api.create.mockResolvedValue({ message: { id: 'draft' } });
  api.request.mockImplementation(async (_ws: string, path: string[]) =>
    path.length === 0
      ? [{ id: 'account', address: 'me@example.invalid', provider: 'google' }]
      : { messages: [], nextCursor: null }
  );
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
function mount(connected: boolean, actor = actorId, compose = false) {
  const content = connected
    ? h(ConnectedMailClient, { workspaceId, folder: 'inbox' })
    : h(MailAppClient, { workspaceId, folder: 'inbox' });
  return render(
    h(
      QueryClientProvider,
      { client },
      h(MailActorProvider, { actorId: actor }, content)
    ),
    {
      wrapper: withNuqsTestingAdapter({
        searchParams: {
          ...(compose ? { compose: '1' } : {}),
          ...(connected ? { account: 'account' } : { mailbox: 'box' }),
        },
        hasMemory: true,
      }),
    }
  );
}
it('connected client previews before consent and initializes only plain fields through the actual composer', async () => {
  mount(true);
  await screen.findByText('confirm');
  expect(
    api.request.mock.calls.some((call) => call[2]?.method === 'POST')
  ).toBe(false);
  expect(api.create).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('connected_to')).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'import' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'import' }));
  await waitFor(() =>
    expect(screen.getByLabelText('connected_to')).toHaveValue(
      'guest@example.invalid'
    )
  );
  expect(screen.getByLabelText('connected_subject')).toHaveValue(
    '<b>Plain title</b>'
  );
  expect(screen.getByLabelText('connected_body')).toHaveValue(
    '<b>Plain title</b>\nhttps://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w'
  );
  expect(document.querySelector('script')).toBeNull();
  expect(
    api.request.mock.calls.some((call) => call[2]?.method === 'POST')
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'connected_save_draft' }));
  await waitFor(() =>
    expect(api.request).toHaveBeenCalledWith(
      workspaceId,
      ['account', 'drafts'],
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          to: ['guest@example.invalid'],
          subject: '<b>Plain title</b>',
          text: expect.stringContaining('https://meet.tuturuuu.com/r/'),
        }),
      })
    )
  );
  const body = api.request.mock.calls.find(
    (call) => call[1][1] === 'drafts'
  )?.[2].body;
  expect(body).not.toHaveProperty('html');
  expect(body).not.toHaveProperty('sourceId');
  expect(api.send).not.toHaveBeenCalled();
});
it('managed client leaves parsing inert, then opens the actual floating composer with escaped plaintext', async () => {
  mount(false);
  await screen.findByText('confirm');
  expect(api.create).not.toHaveBeenCalled();
  expect(api.send).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'import' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'import' }));
  await waitFor(() =>
    expect(
      document.querySelector('input[value="<b>Plain title</b>"]')
    ).not.toBeNull()
  );
  await waitFor(() => expect(api.create).toHaveBeenCalled());
  const payload = api.create.mock.calls[0]?.[2];
  expect(payload.to).toEqual(['guest@example.invalid']);
  expect(payload.bodyText).toContain('<b>Plain title</b>');
  expect(payload.bodyHtml).toContain('&lt;b&gt;Plain title&lt;/b&gt;');
  expect(payload.bodyHtml).not.toContain('<b>Plain title</b>');
  expect(api.send).not.toHaveBeenCalled();
});
it.each([true, false])(
  'protects an existing composer on connected=%s and keeps pending handoff',
  async (connected) => {
    mount(connected, actorId, true);
    await screen.findByText('blocked');
    expect(screen.getByRole('button', { name: 'import' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'new_tab' })).toBeEnabled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.send).not.toHaveBeenCalled();
  }
);
it('does not show a prior actor payload after account switch', async () => {
  mount(true, workspaceId);
  await screen.findByText('invalid');
  expect(screen.queryByText('guest@example.invalid')).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});

it('does not import a duplicate hash or show an old actor preview after a live actor switch', async () => {
  const fragment = window.location.hash;
  const view = mount(true);
  await screen.findByText('confirm');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'import' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'import' }));
  await screen.findByLabelText('connected_to');
  fireEvent.click(screen.getByRole('button', { name: 'connected_close' }));
  window.location.hash = fragment;
  fireEvent(window, new HashChangeEvent('hashchange'));
  await screen.findByText('confirm');
  fireEvent.click(screen.getByRole('button', { name: 'import' }));
  await screen.findByText('invalid');
  expect(screen.queryByLabelText('connected_to')).toBeNull();
  view.rerender(
    h(
      QueryClientProvider,
      { client },
      h(
        MailActorProvider,
        { actorId: workspaceId },
        h(ConnectedMailClient, { workspaceId, folder: 'inbox' })
      )
    )
  );
  await screen.findByText('invalid');
  expect(screen.queryByText('guest@example.invalid')).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});
it('uses the server workspace UUID when Mail is routed through the personal alias', async () => {
  render(
    h(
      QueryClientProvider,
      { client },
      h(
        MailActorProvider,
        { actorId },
        h(MeetMailWorkspaceScope, {
          workspaceId,
          children: h(ConnectedMailClient, {
            workspaceId: 'personal',
            folder: 'inbox',
          }),
        })
      )
    ),
    {
      wrapper: withNuqsTestingAdapter({
        searchParams: { account: 'account' },
        hasMemory: true,
      }),
    }
  );
  await screen.findByText('confirm');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'import' })).toBeEnabled()
  );
  expect(api.create).not.toHaveBeenCalled();
});
it('retains normal managed mailbox permissions and rejects a foreign workspace', async () => {
  api.role = 'reader';
  mount(false);
  await screen.findByText('confirm');
  expect(screen.getByRole('button', { name: 'import' })).toBeDisabled();
  expect(api.create).not.toHaveBeenCalled();
});
