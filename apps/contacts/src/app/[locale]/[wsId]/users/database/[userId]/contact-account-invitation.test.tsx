import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactAccountInvitationCard } from './contact-account-invitation';

const api = vi.hoisted(() => ({
  read: vi.fn(),
  list: vi.fn(),
  invite: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
  useFormatter: () => ({ dateTime: () => 'formatted-date' }),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('./contact-account-invitation-api', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('./contact-account-invitation-api')
  >()),
  readContactAccountInvitation: api.read,
  listContactAccountChoices: api.list,
  inviteContactAccountHolder: api.invite,
  revokeContactAccountInvitation: api.revoke,
}));

const contactId = '07400000-0000-4000-8000-000000000011';
const invitationId = '07400000-0000-4000-8000-000000000012';
const accountId = '07400000-0000-4000-8000-000000000013';

function renderCard(isLinked = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ContactAccountInvitationCard
        contactId={contactId}
        isLinked={isLinked}
        webAppUrl="https://tuturuuu.test"
        workspaceId="ws"
      />
    </QueryClientProvider>
  );
}

const pending = {
  state: 'pending',
  invitationId,
  accountId,
  updatedAt: '2026-11-23T12:00:00Z',
  expiresAt: '2026-11-24T12:00:00Z',
};

describe('ContactAccountInvitationCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.list.mockResolvedValue([
      { id: accountId, display_name: 'Center Parent', email: 'p@example.test' },
      { id: 'other', display_name: 'Someone Else', email: null },
    ]);
  });

  it('invites a chosen workspace account through the consent API', async () => {
    api.read.mockResolvedValueOnce(null).mockResolvedValue(pending);
    api.invite.mockResolvedValue(invitationId);
    renderCard();

    expect(await screen.findByText('none_sent')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invite' }));
    fireEvent.change(await screen.findByLabelText('search'), {
      target: { value: 'parent' },
    });
    expect(screen.queryByText('Someone Else')).toBeNull();
    fireEvent.click(await screen.findByText('Center Parent'));
    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    await waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith('ws', contactId, accountId)
    );
    expect(await screen.findByText('states.pending')).toBeTruthy();
  });

  it('shows a pending invitation link and its account', async () => {
    api.read.mockResolvedValue(pending);
    renderCard();

    const link = (await screen.findByLabelText(
      'link_label'
    )) as HTMLInputElement;
    expect(link.value).toBe(
      `https://tuturuuu.test/contact-link?wsId=ws&contactId=${contactId}&invitationId=${invitationId}`
    );
    expect(
      await screen.findByText('invited_account:Center Parent')
    ).toBeTruthy();
    expect(screen.getByText('expires_at:formatted-date')).toBeTruthy();
  });

  it('resends to the same account, replacing the pending invitation', async () => {
    api.read.mockResolvedValue(pending);
    api.invite.mockResolvedValue('new-invitation');
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'resend' }));
    await waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith('ws', contactId, accountId)
    );
  });

  it('cancels only after in-app confirmation', async () => {
    api.read.mockResolvedValueOnce(pending).mockResolvedValue({
      ...pending,
      state: 'cancelled',
      invitationId: null,
      expiresAt: null,
    });
    api.revoke.mockResolvedValue({ outcome: 'revoked' });
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'revoke' }));
    expect(api.revoke).not.toHaveBeenCalled();
    expect(await screen.findByText('revoke_confirm')).toBeTruthy();
    const confirm = screen
      .getAllByRole('button', { name: 'revoke' })
      .at(-1) as HTMLElement;
    fireEvent.click(confirm);

    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('ws', contactId));
    expect(await screen.findByText('states.cancelled')).toBeTruthy();
    expect(screen.queryByLabelText('link_label')).toBeNull();
  });

  it.each(['declined', 'expired'] as const)(
    'shows %s state and offers a resend',
    async (state) => {
      api.read.mockResolvedValue({
        ...pending,
        state,
        invitationId: null,
      });
      renderCard();
      expect(await screen.findByText(`states.${state}`)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'resend' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'revoke' })).toBeNull();
    }
  );

  it('shows accepted state without invite actions for a linked contact', async () => {
    api.read.mockResolvedValue({
      ...pending,
      state: 'accepted',
      invitationId: null,
      expiresAt: null,
    });
    renderCard(true);
    expect(await screen.findByText('states.accepted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'invite' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'resend' })).toBeNull();
  });

  it('does not report accepted once the contact is no longer linked', async () => {
    api.read.mockResolvedValue({
      ...pending,
      state: 'accepted',
      invitationId: null,
      expiresAt: null,
    });
    renderCard(false);
    expect(await screen.findByText('none_sent')).toBeTruthy();
    expect(screen.queryByText('states.accepted')).toBeNull();
    expect(screen.getByRole('button', { name: 'invite' })).toBeTruthy();
  });
});
