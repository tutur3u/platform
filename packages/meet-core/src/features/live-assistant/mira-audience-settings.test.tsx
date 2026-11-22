// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
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

const f = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  workspace: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  getWorkspace: f.workspace,
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: f.read,
  updateMiraAudienceAttestation: f.write,
}));
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

function show(actorId = 'synthetic-account') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={messages}>
        <WorkspaceVisibilityProvider actorId={actorId}>
          <MiraAudienceSettings wsId={WS} />
        </WorkspaceVisibilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  f.workspace.mockResolvedValue({
    creator_id: 'synthetic-account',
    deleted: false,
  });
});
afterEach(cleanup);

it('gives the workspace owner one switch, what it does and who is responsible', async () => {
  f.read.mockResolvedValue(off);
  show();
  await screen.findByRole('switch', { name: copy.toggle });
  expect(checked()).toBe('false');
  expect(screen.getByText(copy.notice)).toBeTruthy();
  expect(screen.getByText(copy.effect)).toBeTruthy();
  expect(screen.getByText(copy.responsibility)).toBeTruthy();
  expect(screen.queryByText(copy.owner_only)).toBeNull();
  expect(f.read).toHaveBeenCalledWith(WS);
  expect(f.write).not.toHaveBeenCalled();
});

it('declares 18+ with one click before the server answers, then withdraws it the same way', async () => {
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

it('keeps the setting read-only for non-owners even if they could read it as a manager', async () => {
  f.read.mockResolvedValue(on);
  show('synthetic-manager');
  await screen.findByText(copy.owner_only);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByText(copy.responsibility)).toBeNull();
  expect(f.read).not.toHaveBeenCalled();
  expect(f.write).not.toHaveBeenCalled();
});

it('waits for ownership confirmation before loading or exposing the switch', () => {
  f.workspace.mockReturnValue(new Promise(() => undefined));
  show();
  expect(screen.getByText(copy.toggle)).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(f.read).not.toHaveBeenCalled();
});

it('goes read-only when the server refuses an attempted change', async () => {
  f.read.mockResolvedValue(on);
  f.write.mockRejectedValue(refused(403));
  show();
  fireEvent.click(await screen.findByRole('switch', { name: copy.toggle }));
  await screen.findByText(copy.owner_only);
  expect(f.write).toHaveBeenCalledExactlyOnceWith(WS, false);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByText(copy.responsibility)).toBeNull();
  expect(f.toastError).not.toHaveBeenCalled();
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
