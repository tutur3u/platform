// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';
import vietnamese from '../../../../../apps/meet/messages/vi.json';
import type { MeetRoomController } from '../call/lib/room-controller';
import { MeetLivePanel } from './live-panel';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  hidden: vi.fn(),
  start: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: mocks.list,
}));
vi.mock('./use-live-assistant', () => ({
  useLiveAssistant: () => ({
    status: 'idle',
    mode: 'personal',
    start: mocks.start,
    send: vi.fn(),
  }),
}));
vi.mock('../call/components/mira-profile', () => ({ MiraAvatar: () => null }));
vi.mock('./room-audio', () => ({ RoomAiAudio: () => null }));
vi.mock('./memory-settings', () => ({ MemorySettings: () => null }));
vi.mock('./live-review-card', () => ({ LiveReviewCard: () => null }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hidden.mockResolvedValue({ hiddenWorkspaceIds: [] });
  mocks.list.mockResolvedValue([
    {
      id: 'personal-workspace',
      name: 'Personal',
      personal: true,
      access_type: 'member',
    },
    {
      id: 'team-workspace',
      name: 'Synthetic team',
      personal: false,
      access_type: 'member',
    },
    {
      id: 'guest-workspace',
      name: 'Synthetic guest',
      personal: false,
      access_type: 'guest',
    },
  ]);
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

it('opens and selects a member workspace inside the actual Live dialog for a distinct device identity', async () => {
  const { client } = renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  const trigger = screen.getByRole('combobox', { name: 'Workspace' });
  await waitFor(() =>
    expect((trigger as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const team = await screen.findByRole('option', { name: 'Synthetic team' });
  expect(screen.queryByRole('option', { name: 'Synthetic guest' })).toBeNull();
  fireEvent.click(team);
  await waitFor(() => expect(trigger.textContent).toContain('Synthetic team'));
  fireEvent.click(screen.getByRole('button', { name: /Personal assistant/ }));
  await waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith(
      'personal',
      [],
      '',
      'team-workspace',
      'Aoede'
    )
  );
  act(() =>
    client.setQueryData(
      ['workspace-hidden', 'account-owner'],
      ['team-workspace']
    )
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: /Personal assistant/,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true)
  );
  fireEvent.click(screen.getByRole('button', { name: /Personal assistant/ }));
  expect(mocks.start).toHaveBeenCalledTimes(1);
});

function renderPanel(actor = 'account-owner', locale: 'en' | 'vi' = 'en') {
  const room = {
    state: {
      selfUserId: 'device-participant',
      participants: {},
      chat: [],
      liveAssistant: null,
    },
    localStream: null,
    remoteMedia: {},
    media: { audioEnabled: false },
    getSelectedDevices: () => ({ audio: '', microphoneRevision: 0 }),
  } as unknown as MeetRoomController;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actor: string, expectedAccount = actor) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actor}>
        <NextIntlClientProvider
          locale={locale}
          messages={locale === 'en' ? messages : vietnamese}
        >
          <MeetLivePanel
            accountId={expectedAccount}
            room={room}
            meetingId="synthetic-meeting"
            outputDeviceId=""
            canManage
            onOpenChat={vi.fn()}
          />
        </NextIntlClientProvider>
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return { ...render(view(actor)), client, view };
}

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  // jsdom lacks native PointerEvent fields. Supply DOM mechanics only; the
  // actual Radix Dialog and Select event handlers remain unchanged.
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

it('selects team then personal via actual pointer events without closing the Live dialog', async () => {
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.hidden).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Workspace' }).textContent
    ).toContain('Personal workspace')
  );
  const trigger = screen.getByRole('combobox', { name: 'Workspace' });
  fireEvent.pointerDown(trigger, {
    button: 0,
    pointerType: 'mouse',
    clientX: 1,
    clientY: 1,
  });
  const team = await screen.findByRole('option', { name: 'Synthetic team' });
  fireEvent.pointerMove(team, {
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
  });
  fireEvent.pointerUp(team, {
    button: 0,
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
  });
  await waitFor(() => expect(trigger.textContent).toContain('Synthetic team'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  fireEvent.pointerDown(trigger, {
    button: 0,
    pointerType: 'mouse',
    clientX: 1,
    clientY: 1,
  });
  const personal = await screen.findByRole('option', {
    name: 'Mira · Personal workspace',
  });
  fireEvent.pointerMove(personal, {
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
  });
  fireEvent.pointerUp(personal, {
    button: 0,
    pointerType: 'mouse',
    clientX: 50,
    clientY: 50,
  });
  await waitFor(() =>
    expect(trigger.textContent).toContain('Personal workspace')
  );
  fireEvent.click(screen.getByRole('button', { name: /Personal assistant/ }));
  await waitFor(() =>
    expect(mocks.start).toHaveBeenCalledWith(
      'personal',
      [],
      '',
      undefined,
      'Aoede'
    )
  );
});
it('explains held workspace visibility rather than silently offering no options', async () => {
  const visibility = held<{ hiddenWorkspaceIds: string[] }>();
  mocks.hidden.mockReturnValue(visibility.promise);
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  const start = screen.getByRole('button', {
    name: /Personal assistant/,
  }) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  expect(screen.getByRole('status').textContent?.trim()).not.toBe('');
  await act(async () => visibility.resolve({ hiddenWorkspaceIds: [] }));
  await waitFor(() => expect(start.disabled).toBe(false));
});
it('shows workspace lookup failure while preventing private context start', async () => {
  mocks.list.mockRejectedValue(new Error('Synthetic unavailable'));
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent?.trim()).not.toBe('')
  );
  expect(
    (
      screen.getByRole('button', {
        name: /Personal assistant/,
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(mocks.start).not.toHaveBeenCalled();
});
it('does not revive departed actor workspace choices after a held A→B→A lookup', async () => {
  const old =
    held<
      Array<{
        id: string;
        name: string;
        personal: boolean;
        access_type: string;
      }>
    >();
  mocks.list.mockReturnValueOnce(old.promise).mockResolvedValue([
    {
      id: 'personal-workspace',
      name: 'Personal',
      personal: true,
      access_type: 'member',
    },
  ]);
  const tree = renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  tree.rerender(tree.view('actor-b'));
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
  tree.rerender(tree.view('account-owner'));
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3));
  await act(async () =>
    old.resolve([
      {
        id: 'team-workspace',
        name: 'Departed actor team',
        personal: false,
        access_type: 'member',
      },
    ])
  );
  const trigger = screen.getByRole('combobox', { name: 'Workspace' });
  await waitFor(() =>
    expect(trigger.textContent).toContain('Personal workspace')
  );
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await screen.findByRole('option', { name: 'Mira · Personal workspace' });
  expect(
    screen.queryByRole('option', { name: 'Departed actor team' })
  ).toBeNull();
});

for (const locale of ['en', 'vi'] as const) {
  const text = locale === 'en' ? messages.meet.call : vietnamese.meet.call;
  it(`recovers an explicit workspace lookup retry in ${locale} without raw errors`, async () => {
    mocks.list.mockRejectedValue(new Error('Synthetic private provider body'));
    renderPanel('account-owner', locale);
    fireEvent.click(
      screen.getByRole('button', {
        name:
          locale === 'en'
            ? messages.meet.live.title
            : vietnamese.meet.live.title,
      })
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toBe(
      text.assistant_workspace_error
    );
    expect(screen.queryByText('Synthetic private provider body')).toBeNull();
    mocks.list.mockResolvedValue([
      {
        id: 'personal-workspace',
        name: 'Personal',
        personal: true,
        access_type: 'member',
      },
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: text.assistant_workspace_retry })
    );
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    const trigger = screen.getByRole('combobox', {
      name: text.assistant_workspace,
    });
    await waitFor(() =>
      expect((trigger as HTMLButtonElement).disabled).toBe(false)
    );
    expect(trigger.textContent).toContain(text.assistant_personal_workspace);
    expect(mocks.hidden.mock.calls.length).toBeGreaterThan(1);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it(`explains no eligible visible workspaces and denies selection in ${locale}`, async () => {
    mocks.hidden.mockResolvedValue({
      hiddenWorkspaceIds: ['team-workspace', 'personal-workspace'],
    });
    renderPanel('account-owner', locale);
    fireEvent.click(
      screen.getByRole('button', {
        name:
          locale === 'en'
            ? messages.meet.live.title
            : vietnamese.meet.live.title,
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        text.assistant_workspace_empty
      )
    );
    const trigger = screen.getByRole('combobox', {
      name: text.assistant_workspace,
    });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('option')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();
  });
}

it('keeps cached current-actor choices disabled for a different supplied account', async () => {
  const tree = renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  const trigger = screen.getByRole('combobox', {
    name: 'Workspace',
  }) as HTMLButtonElement;
  await waitFor(() => expect(trigger.disabled).toBe(false));
  tree.rerender(tree.view('account-owner', 'other-account'));
  await waitFor(() => expect(trigger.disabled).toBe(true));
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  expect(screen.queryByRole('option')).toBeNull();
  expect(mocks.start).not.toHaveBeenCalled();
});

it('does not retry failed workspace queries for a mismatched supplied account', async () => {
  mocks.list.mockRejectedValue(new Error('Synthetic unavailable'));
  const tree = renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Mira Live' }));
  await screen.findByRole('alert');
  tree.rerender(tree.view('account-owner', 'other-account'));
  const retry = screen.getByRole('button', {
    name: messages.meet.call.assistant_workspace_retry,
  }) as HTMLButtonElement;
  expect(retry.disabled).toBe(true);
  const lookups = mocks.list.mock.calls.length;
  const visibility = mocks.hidden.mock.calls.length;
  fireEvent.click(retry);
  expect(mocks.list).toHaveBeenCalledTimes(lookups);
  expect(mocks.hidden).toHaveBeenCalledTimes(visibility);
  expect(mocks.start).not.toHaveBeenCalled();
});
