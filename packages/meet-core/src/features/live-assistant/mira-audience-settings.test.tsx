// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../apps/meet/messages/en.json';

type Listed = { id: string; created_by_me?: boolean };
const f = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  policy: vi.fn(),
  toastError: vi.fn(),
  actor: null as { actorId: string } | null,
  workspaces: { data: undefined as Listed[] | undefined, isLoading: false },
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => f.actor,
}));
vi.mock('@tuturuuu/ui/hooks/use-visible-workspaces', () => ({
  useVisibleWorkspaces: () => f.workspaces,
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: f.read,
  updateMiraAudienceAttestation: f.write,
}));
vi.mock('@tuturuuu/internal-api', () => ({ readPrivateMiraPolicy: f.policy }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: f.toastError } }));

import { MiraAudienceSettings } from './mira-audience-settings';

const copy = messages.meet.mira_adults;
const WS = 'synthetic-workspace';
const off = { attested: false, attestedAt: null, attestedByCurrentUser: false };
const on = {
  attested: true,
  attestedAt: '2026-11-20T00:00:00Z',
  attestedByCurrentUser: true,
};
const refused = (status: number) =>
  Object.assign(new Error('Synthetic refusal'), { status });
const toggle = () =>
  screen.getByRole('switch', { name: copy.toggle }) as HTMLButtonElement;
const checked = () => toggle().getAttribute('aria-checked');

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <MiraAudienceSettings wsId={WS} meetingId="synthetic-meeting" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
}

/** The viewer's workspace list, which names the owner of each workspace. */
function listed(createdByMe: boolean) {
  f.actor = { actorId: 'synthetic-account' };
  f.workspaces = {
    data: [{ id: WS, created_by_me: createdByMe }],
    isLoading: false,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  f.actor = null;
  f.workspaces = { data: undefined, isLoading: false };
});
afterEach(cleanup);

it('gives people who manage the workspace one switch, what it does and who is responsible', async () => {
  f.read.mockResolvedValue(off);
  show();
  await screen.findByRole('switch', { name: copy.toggle });
  expect(checked()).toBe('false');
  expect(screen.getByText(copy.notice)).toBeTruthy();
  expect(screen.getByText(copy.effect)).toBeTruthy();
  expect(screen.getByText(copy.responsibility)).toBeTruthy();
  expect(screen.queryByText(copy.owner_only)).toBeNull();
  expect(f.read).toHaveBeenCalledWith(WS);
  expect(f.policy).not.toHaveBeenCalled();
  expect(f.write).not.toHaveBeenCalled();
});

it('declares 18+ with one click before the server answers, then withdraws it the same way', async () => {
  listed(true);
  f.read.mockResolvedValue(off);
  let confirm: (saved: typeof on) => void = () => undefined;
  f.write.mockReturnValueOnce(
    new Promise<typeof on>((resolve) => {
      confirm = resolve;
    })
  );
  const client = show();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(await screen.findByRole('switch', { name: copy.toggle }));
  await waitFor(() => expect(checked()).toBe('true'));
  await waitFor(() =>
    expect(f.write).toHaveBeenCalledExactlyOnceWith(WS, true)
  );
  expect(screen.queryByRole('alertdialog')).toBeNull();
  confirm(on);
  await screen.findByText('Confirmed on Nov 20, 2026');
  // Mira surfaces read their availability again after the change.
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['mira-private-choice'],
  });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['room-mira-consent'] });

  f.write.mockResolvedValueOnce(off);
  await waitFor(() => expect(toggle().disabled).toBe(false));
  fireEvent.click(toggle());
  await waitFor(() => expect(f.write).toHaveBeenLastCalledWith(WS, false));
  await waitFor(() => expect(checked()).toBe('false'));
  await waitFor(() => expect(screen.queryByText(/Confirmed on/)).toBeNull());
  expect(f.toastError).not.toHaveBeenCalled();
});

it('puts the switch back and reports the failure when saving fails', async () => {
  f.read.mockResolvedValue(off);
  let fail: (error: Error) => void = () => undefined;
  f.write.mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject;
    })
  );
  show();
  fireEvent.click(await screen.findByRole('switch', { name: copy.toggle }));
  await waitFor(() => expect(checked()).toBe('true'));
  fail(refused(500));
  await waitFor(() => expect(checked()).toBe('false'));
  expect(f.toastError).toHaveBeenCalledExactlyOnceWith(copy.save_failed);
  expect(toggle().disabled).toBe(false);
  expect(screen.queryByText(copy.owner_only)).toBeNull();
});

it('never asks for the setting or shows a switch to someone the workspace list names as not the owner', async () => {
  listed(false);
  f.policy.mockResolvedValue({
    version: 'v1',
    choice: null,
    available: false,
    unavailableReason: 'workspace',
  });
  show();
  await screen.findByText(copy.state_off);
  expect(screen.getByText(copy.owner_only)).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(copy.responsibility)).toBeNull();
  expect(f.read).not.toHaveBeenCalled();
  expect(f.write).not.toHaveBeenCalled();
});

it('waits for the workspace list before asking for the setting', async () => {
  f.actor = { actorId: 'synthetic-account' };
  f.workspaces = { data: undefined, isLoading: true };
  show();
  expect(screen.getByText(copy.toggle)).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByText(copy.owner_only)).toBeNull();
  expect(f.read).not.toHaveBeenCalled();
});

it('turns read-only with the reason when the list cannot name the owner and the write is refused', async () => {
  f.read.mockResolvedValue(on);
  f.write.mockRejectedValue(refused(403));
  show();
  fireEvent.click(await screen.findByRole('switch', { name: copy.toggle }));
  expect((await screen.findByRole('alert')).textContent).toBe(copy.owner_only);
  expect(f.write).toHaveBeenCalledExactlyOnceWith(WS, false);
  expect(screen.queryByRole('switch')).toBeNull();
  // The stored value is restored and shown as a state, not as a control.
  expect(screen.getByText(copy.state_on)).toBeTruthy();
  expect(screen.queryByText(copy.responsibility)).toBeNull();
  expect(f.toastError).not.toHaveBeenCalled();
});

it.each([
  ['off', { available: false, unavailableReason: 'workspace' }, copy.state_off],
  ['on', { available: true }, copy.state_on],
] as const)(
  'shows people who cannot manage the workspace that Mira is %s, without a switch',
  async (_state, policy, label) => {
    f.read.mockRejectedValue(refused(403));
    f.policy.mockResolvedValue({ version: 'v1', choice: null, ...policy });
    show();
    await screen.findByText(copy.owner_only);
    expect(await screen.findByText(label)).toBeTruthy();
    expect(f.policy).toHaveBeenCalledWith('synthetic-meeting');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(copy.responsibility)).toBeNull();
    expect(screen.getByText(copy.effect)).toBeTruthy();
    expect(f.write).not.toHaveBeenCalled();
  }
);

it('claims no state for a member when the meeting cannot tell why Mira is unavailable', async () => {
  f.read.mockRejectedValue(refused(403));
  f.policy.mockResolvedValue({
    version: 'v1',
    choice: null,
    available: false,
    unavailableReason: 'account',
  });
  show();
  await screen.findByText(copy.owner_only);
  await waitFor(() => expect(f.policy).toHaveBeenCalled());
  expect(screen.queryByText(copy.state_on)).toBeNull();
  expect(screen.queryByText(copy.state_off)).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
});

it('offers a retry when the setting cannot be loaded for another reason', async () => {
  f.read.mockRejectedValueOnce(refused(500)).mockResolvedValue(off);
  show();
  expect((await screen.findByRole('alert')).textContent).toContain(
    copy.load_failed
  );
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByText(copy.owner_only)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.retry }));
  await screen.findByRole('switch', { name: copy.toggle });
});
