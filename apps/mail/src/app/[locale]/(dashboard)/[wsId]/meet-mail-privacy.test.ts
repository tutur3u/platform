// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createElement as h } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  meetMailFragment,
  type MeetMailHandoff,
} from '@tuturuuu/utils/meet-mail-handoff';
import { MailActorProvider } from '@/components/mail-actor-provider';
import { MeetMailHandoffPreview } from './meet-mail-handoff-preview';
import { MeetMailWorkspaceScope } from './meet-mail-workspace-scope';
const api = vi.hoisted(() => ({ people: vi.fn() }));
vi.mock('@tuturuuu/internal-api/people', () => ({
  searchWorkspacePeople: api.people,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
class Channel {
  static channels = new Set<Channel>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  constructor(readonly name: string) {
    Channel.channels.add(this);
  }
  postMessage(data: unknown) {
    for (const other of Channel.channels)
      if (other !== this && other.name === this.name)
        queueMicrotask(() => {
          if (Channel.channels.has(other))
            other.onmessage?.(new MessageEvent('message', { data }));
        });
  }
  close() {
    Channel.channels.delete(this);
  }
}
const actorId = '00000000-0000-4000-8000-000000000001',
  workspaceId = '00000000-0000-4000-8000-000000000002';
let payload: MeetMailHandoff;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('BroadcastChannel', Channel);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: async (_: string, fn: () => unknown) => fn() },
  });
  payload = {
    v: 1,
    source: 'meet',
    id: crypto.randomUUID(),
    issuedAt: Date.now(),
    actorId,
    workspaceId,
    subject: 'Private meeting',
    joinUrl: 'https://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
    body: 'Private meeting\nhttps://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
    to: ['member@example.invalid', 'external@example.invalid'],
  };
  api.people
    .mockReset()
    .mockImplementation(async (_ws: string, { query }: { query: string }) => ({
      data: query.startsWith('member')
        ? [
            {
              kind: 'member',
              email: query,
              id: actorId,
              displayName: null,
              avatarUrl: null,
            },
          ]
        : [
            {
              kind: 'contact',
              email: query,
              id: actorId,
              displayName: null,
              avatarUrl: null,
              linkedUserId: null,
            },
          ],
    }));
  history.replaceState(
    {},
    '',
    '/en/' + workspaceId + '/inbox' + meetMailFragment(payload)
  );
});
afterEach(() => {
  cleanup();
  Channel.channels.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function preview(
  key: string,
  blocked: boolean,
  onImport: (value: unknown) => void
) {
  return h(MeetMailHandoffPreview, {
    key,
    workspaceId,
    sourceKey: key,
    blocked,
    canImport: true,
    onImport,
  });
}
function root(child: ReturnType<typeof preview>) {
  return h(
    QueryClientProvider,
    { client: new QueryClient() },
    h(
      MailActorProvider,
      { actorId },
      h(MeetMailWorkspaceScope, { workspaceId, children: child })
    )
  );
}
it('immediately removes private hash, warns about link provenance and flags nonmembers', async () => {
  render(root(preview('account', false, vi.fn())));
  await screen.findByText('link_warning');
  expect(location.hash).toBe('');
  expect(location.href).not.toContain('Private');
  expect(location.href).not.toContain('example.invalid');
  await waitFor(() =>
    expect(
      within(
        screen.getByText('member@example.invalid').closest('li')!
      ).queryByText('external')
    ).toBeNull()
  );
  expect(
    within(
      screen.getByText('external@example.invalid').closest('li')!
    ).getByText('external')
  ).toBeVisible();
  expect(api.people).toHaveBeenCalledWith(workspaceId, {
    query: 'member@example.invalid',
    limit: 10,
  });
});
it('keeps the private draft in memory when Mail source switches after hash removal', async () => {
  const client = new QueryClient();
  const node = (key: string) =>
    h(
      QueryClientProvider,
      { client },
      h(
        MailActorProvider,
        { actorId },
        h(MeetMailWorkspaceScope, {
          workspaceId,
          children: preview(key, false, vi.fn()),
        })
      )
    );
  const view = render(node('connected'));
  await screen.findByText('Private meeting');
  expect(location.hash).toBe('');
  view.rerender(node('managed'));
  expect(await screen.findByText('Private meeting')).toBeVisible();
});
it('opens an opaque new-tab URL and transfers only over a same-origin browser channel before consent', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  const sender = vi.fn(),
    receiver = vi.fn();
  render(root(preview('old', true, sender)));
  await screen.findByText('link_warning');
  fireEvent.click(screen.getByRole('button', { name: 'new_tab' }));
  const url = new URL(String(open.mock.calls[0]?.[0]));
  expect(url.hash).toMatch(/^#mail-transfer=[\da-f-]+$/);
  expect(url.href).not.toContain('meet-mail=');
  expect(url.href).not.toContain('example.invalid');
  expect(url.href).not.toContain('Private');
  history.replaceState({}, '', url.pathname + url.hash);
  const target = render(root(preview('new', false, receiver)));
  await within(target.container).findByText('Private meeting');
  expect(location.hash).toBe('');
  expect(receiver).not.toHaveBeenCalled();
  expect(sender).not.toHaveBeenCalled();
  await act(async () =>
    fireEvent.click(
      within(target.container).getByRole('button', { name: 'import' })
    )
  );
  await waitFor(() => expect(receiver).toHaveBeenCalledOnce());
  expect(receiver).toHaveBeenCalledWith({
    to: payload.to,
    subject: payload.subject,
    text: payload.body,
  });
});
it('retains external warning when the permitted member lookup fails', async () => {
  api.people.mockRejectedValue(new Error('unavailable'));
  render(root(preview('account', false, vi.fn())));
  await screen.findByText('link_warning');
  await waitFor(() => expect(api.people).toHaveBeenCalled());
  expect(screen.getAllByText('external')).toHaveLength(2);
});
