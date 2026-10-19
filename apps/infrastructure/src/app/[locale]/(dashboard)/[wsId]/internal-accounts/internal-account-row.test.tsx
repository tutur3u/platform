import { fireEvent, render, screen } from '@testing-library/react';
import type { InternalAccount } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { InternalAccountRow } from './internal-account-row';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('./employee-restoration-dialog', () => ({
  EmployeeRestorationDialog: () => null,
}));
vi.mock('./internal-account-edit-dialog', () => ({
  InternalAccountEditDialog: () => null,
}));

const account: InternalAccount = {
  id: 'synthetic-target',
  email: 'synthetic@tuturuuu.com',
  isDisabled: false,
  isSelf: false,
  bannedUntil: null,
  createdAt: '2026-09-22T00:00:00Z',
  displayName: 'Synthetic',
  emailConfirmedAt: '2026-09-22T00:00:00Z',
  lastSignInAt: null,
  personalWorkspaceId: null,
  storageLimitBytes: null,
  storageUsedBytes: null,
  username: null,
};

async function openMenu(target = account) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(
    <InternalAccountRow
      account={target}
      isWorking={false}
      onConfirm={onConfirm}
      onDirectoryRefresh={vi.fn()}
    />
  );
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'actions.open_menu' }),
    { button: 0, ctrlKey: false, pointerType: 'mouse' }
  );
  await screen.findByRole('menu');
  return { onConfirm };
}

describe('existing account password and access controls', () => {
  it.each([
    { isDisabled: false, action: 'disable_access', opposite: 'enable-access' },
    { isDisabled: true, action: 'enable_access', opposite: 'disable-access' },
  ] as const)(
    'confirms $action for the selected account',
    async ({ isDisabled, action, opposite }) => {
      const { onConfirm } = await openMenu({ ...account, isDisabled });
      expect(
        screen.queryByTestId(`${opposite}-${account.email}`)
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('menuitem', { name: `actions.${action}` })
      );
      const submit = screen.getByTestId('internal-account-confirm-action');
      expect(submit).toBeDisabled();
      fireEvent.change(screen.getByLabelText('dialog.confirmation_label'), {
        target: { value: account.email },
      });
      fireEvent.click(submit);
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
        action,
        confirmationEmail: account.email,
      });
    }
  );

  it('opens the existing reset dialog with typed and generated passwords', async () => {
    const { onConfirm } = await openMenu();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'actions.reset_password' })
    );
    fireEvent.change(screen.getByLabelText('dialog.confirmation_label'), {
      target: { value: account.email },
    });
    fireEvent.change(screen.getByLabelText('new_password'), {
      target: { value: 'Synthetic-password-123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'generate_password' }));
    const generated =
      screen.getByLabelText<HTMLInputElement>('new_password').value;
    expect(generated).toHaveLength(20);
    fireEvent.click(screen.getByTestId('internal-account-confirm-action'));
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      action: 'reset_password',
      confirmationEmail: account.email,
      newPassword: generated,
    });
  });

  it('keeps self password and access mutations disabled', async () => {
    await openMenu({ ...account, isSelf: true });
    expect(
      screen.getByRole('menuitem', { name: 'actions.reset_password' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'actions.disable_access' })
    ).toHaveAttribute('aria-disabled', 'true');
  });
});
