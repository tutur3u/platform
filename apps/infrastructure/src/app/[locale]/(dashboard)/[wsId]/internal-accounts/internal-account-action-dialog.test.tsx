import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAccount } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { InternalAccountActionDialog } from './internal-account-action-dialog';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: { email: string; password: string }) =>
      key === 'dialog.reset_password.handoff_message' && values
        ? `${values.email}:${values.password}`
        : key,
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

  it.each(['type', 'generate'] as const)(
    'hands off the actual submitted credential after pending %s attempts',
    async (attempt) => {
      const submittedPassword = 'Synthetic-password-A!';
      let finish: () => void = () => {
        throw new Error('Request not pending');
      };
      const onConfirm = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      render(
        <InternalAccountActionDialog
          account={account}
          action="reset_password"
          open
          onConfirm={onConfirm}
          onOpenChange={vi.fn()}
        />
      );
      const confirmation = screen.getByLabelText('dialog.confirmation_label');
      const password = screen.getByLabelText('new_password');
      const generate = screen.getByRole('button', {
        name: 'generate_password',
      });
      fireEvent.change(confirmation, { target: { value: account.email } });
      fireEvent.change(password, { target: { value: submittedPassword } });
      fireEvent.click(screen.getByTestId('internal-account-confirm-action'));
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
        action: 'reset_password',
        confirmationEmail: account.email,
        newPassword: submittedPassword,
      });
      const fieldsWereDisabled = [confirmation, password, generate].map(
        (control) => control.matches(':disabled')
      );
      if (attempt === 'type') {
        fireEvent.change(password, {
          target: { value: 'Synthetic-password-B!' },
        });
      } else {
        fireEvent.click(generate);
      }
      finish();
      await waitFor(() =>
        expect(
          screen.getByLabelText('dialog.reset_password.handoff_label')
        ).toHaveValue(`${account.email}:${submittedPassword}`)
      );
      expect(fieldsWereDisabled).toEqual([true, true, true]);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    }
  );
});
