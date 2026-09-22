import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAccount } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { InternalAccountActionDialog } from './internal-account-action-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const account: InternalAccount = {
  id: 'target',
  email: 'target@tuturuuu.com',
  isDisabled: false,
  isSelf: false,
  bannedUntil: null,
  createdAt: '2026-09-22T00:00:00Z',
  displayName: 'Target',
  emailConfirmedAt: '2026-09-22T00:00:00Z',
  lastSignInAt: null,
  personalWorkspaceId: null,
  storageLimitBytes: null,
  storageUsedBytes: null,
  username: null,
};

describe('authenticator reset confirmation', () => {
  it('requires target confirmation and waits for the server before closing', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const onConfirm = vi.fn(() => pending);
    const onOpenChange = vi.fn();
    render(
      <InternalAccountActionDialog
        account={account}
        action="reset_mfa"
        open
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    );
    const submit = screen.getByTestId('internal-account-confirm-action');
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('dialog.confirmation_label'), {
      target: { value: 'other@tuturuuu.com' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('dialog.confirmation_label'), {
      target: { value: account.email },
    });
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith({
      action: 'reset_mfa',
      confirmationEmail: account.email,
    });
    expect(submit).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the confirmation available for retry when the server refuses a reset', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Reset unavailable'));
    const onOpenChange = vi.fn();
    render(
      <InternalAccountActionDialog
        account={account}
        action="reset_mfa"
        open
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />
    );
    fireEvent.change(screen.getByLabelText('dialog.confirmation_label'), {
      target: { value: account.email },
    });
    const submit = screen.getByTestId('internal-account-confirm-action');
    fireEvent.click(submit);
    await waitFor(() => expect(submit).not.toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
