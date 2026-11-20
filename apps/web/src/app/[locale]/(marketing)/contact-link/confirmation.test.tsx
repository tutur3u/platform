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

const expiry = { expiresAt: '2026-11-20T10:00:00Z', locale: 'en' };

const copy = {
  confirm: 'Confirm account link',
  confirming: 'Confirming…',
  description: 'Confirm the contact in Sample workspace.',
  expires: 'Expires',
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
    render(
      <ContactLinkConfirmation
        invitation={invitation}
        copy={copy}
        {...expiry}
      />
    );
    expect(api.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('status')).toHaveTextContent(copy.linked);
    expect(api.confirm).toHaveBeenCalledWith('workspace', {
      action: 'confirm',
      workspaceUserId: 'contact',
      invitationId: 'invitation',
    });
  });

  it('shows the invitation expiry in the browser time zone', () => {
    const resolved = Intl.DateTimeFormat.prototype.resolvedOptions;
    const zone = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockImplementation(function (this: Intl.DateTimeFormat) {
        return { ...resolved.call(this), timeZone: 'Pacific/Honolulu' };
      });
    try {
      render(
        <ContactLinkConfirmation
          invitation={invitation}
          copy={copy}
          {...expiry}
        />
      );
      expect(screen.getByText(/12:00 AM HST/)).toHaveAttribute(
        'datetime',
        expiry.expiresAt
      );
    } finally {
      zone.mockRestore();
    }
  });

  it('declines without submitting a confirmation', async () => {
    api.confirm.mockResolvedValue({ outcome: 'declined' });
    render(
      <ContactLinkConfirmation
        invitation={invitation}
        copy={copy}
        {...expiry}
      />
    );
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
    render(
      <ContactLinkConfirmation
        invitation={invitation}
        copy={copy}
        {...expiry}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: copy.confirm }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      copy.unavailable
    );
    expect(screen.queryByText('private rejection detail')).toBeNull();
  });
});
