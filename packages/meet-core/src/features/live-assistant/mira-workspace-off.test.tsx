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
import vietnamese from '../../../../../apps/meet/messages/vi.json';

const f = vi.hoisted(() => ({
  read: vi.fn(),
  workspace: vi.fn(),
  open: undefined as ((tab: string) => void) | undefined,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  getWorkspace: f.workspace,
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getMiraAudienceAttestation: f.read,
  updateMiraAudienceAttestation: vi.fn(),
}));
vi.mock('../call/components/call-settings-link', () => ({
  useOpenCallSettings: () => f.open,
}));

import { MiraAdultNotice } from './mira-adult-notice';
import { MiraWorkspaceOff } from './mira-workspace-off';

const copy = messages.meet.mira_adults;
const off = { attested: false, attestedAt: null, attestedByCurrentUser: false };
const refused = (status: number) =>
  Object.assign(new Error('Synthetic refusal'), { status });

function show(locale: 'en' | 'vi' = 'en') {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? messages : vietnamese}
      >
        <WorkspaceVisibilityProvider actorId="synthetic-account">
          <MiraWorkspaceOff wsId="synthetic-workspace" />
        </WorkspaceVisibilityProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  f.open = vi.fn();
  f.workspace.mockResolvedValue({ creator_id: 'synthetic-account' });
});
afterEach(cleanup);

it('tells a non-owner to ask the owner without asking for the setting', async () => {
  f.workspace.mockResolvedValue({ creator_id: 'someone-else' });
  show();
  expect(screen.getByText(copy.workspace_off)).toBeTruthy();
  expect(await screen.findByText(copy.ask_owner)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(f.read).not.toHaveBeenCalled();
});

it('gives the workspace owner a button to the Mira settings', async () => {
  f.read.mockResolvedValue(off);
  show();
  expect(screen.getByText(copy.workspace_off)).toBeTruthy();
  fireEvent.click(
    await screen.findByRole('button', { name: copy.open_settings })
  );
  expect(f.open).toHaveBeenCalledExactlyOnceWith('mira');
  expect(screen.queryByText(copy.ask_owner)).toBeNull();
});

it('tells someone whose read of the setting is refused to ask the workspace owner, in their language', async () => {
  f.read.mockRejectedValue(refused(403));
  show('vi');
  await screen.findByText(vietnamese.meet.mira_adults.ask_owner);
  expect(
    screen.getByText(vietnamese.meet.mira_adults.workspace_off)
  ).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(f.open).not.toHaveBeenCalled();
});

it('names the reason alone while it cannot tell who may change the setting', async () => {
  f.read.mockRejectedValue(refused(500));
  show();
  await waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.getByText(copy.workspace_off)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText(copy.ask_owner)).toBeNull();
});

it('offers no button where the meeting settings cannot be opened', async () => {
  f.open = undefined;
  f.read.mockResolvedValue(off);
  show();
  await waitFor(() => expect(f.read).toHaveBeenCalled());
  expect(screen.getByText(copy.workspace_off)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('keeps a control name intact and reads the compact 18+ badge as its description', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <button type="button" aria-describedby="adults">
        Mira
        <MiraAdultNotice variant="compact" id="adults" />
      </button>
      <MiraAdultNotice />
      <MiraAdultNotice consent />
    </NextIntlClientProvider>
  );
  const control = screen.getByRole('button', { name: 'Mira' });
  expect(control.textContent).toContain(copy.badge);
  expect(document.getElementById('adults')?.textContent).toBe(copy.notice);
  // The badge description and the inline sentence carry the same rule.
  expect(screen.getAllByText(copy.notice)).toHaveLength(2);
  expect(screen.getByText(copy.consent)).toBeTruthy();
});
