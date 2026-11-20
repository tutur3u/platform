// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactLinkConfirmation } from './confirmation';

const api = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  respondToWorkspaceContactAccountLink: api.confirm,
}));

const invitation = {
  wsId: 'workspace',
  contactId: 'contact',
  invitationId: 'invitation',
};

const copy = {
  confirm: 'Confirm account link',
  confirming: 'Confirming…',
  description: 'Confirm the contact in Sample workspace.',
  expires: 'Expires at 10:00 UTC.',
  decline: 'Decline',
  declined: 'Invitation declined.',
  linked: 'Your account is linked.',
  unavailable: 'This invitation is unavailable.',
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('contact link confirmation screen', () => {
  it('waits for explicit confirmation and submits the exact invitation', async () => {
    api.confirm.mockResolvedValue({ outcome: 'linked' });
    render(<ContactLinkConfirmation invitation={invitation} copy={copy} />);
    expect(api.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('status')).toHaveTextContent(copy.linked);
    expect(api.confirm).toHaveBeenCalledWith('workspace', {
      action: 'confirm',
      workspaceUserId: 'contact',
      invitationId: 'invitation',
    });
  });

  it('declines without submitting a confirmation', async () => {
    api.confirm.mockResolvedValue({ outcome: 'declined' });
    render(<ContactLinkConfirmation invitation={invitation} copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.decline }));
    expect(await screen.findByRole('status')).toHaveTextContent(copy.declined);
    expect(api.confirm).toHaveBeenCalledWith('workspace', {
      action: 'decline',
      workspaceUserId: 'contact',
      invitationId: 'invitation',
    });
  });

  it('shows only the recovery message after a rejected confirmation', async () => {
    api.confirm.mockRejectedValue(new Error('private rejection detail'));
    render(<ContactLinkConfirmation invitation={invitation} copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      copy.unavailable
    );
    expect(screen.queryByText('private rejection detail')).toBeNull();
  });
});
