import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAccount } from '@tuturuuu/internal-api/infrastructure';
import { expect, it, vi } from 'vitest';
import { InternalAccountEditDialog } from './internal-account-edit-dialog';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
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
function setup(username: string | null = null) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <InternalAccountEditDialog
      account={{ ...account, username }}
      open
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
    />
  );
  return {
    onConfirm,
    onOpenChange,
    input: screen.getByLabelText('profile.username'),
    save: screen.getByRole('button', { name: 'profile.save' }),
  };
}
it.each([1, 4, 33, 65, 81, 1001])(
  'submits normalized %i character usernames without HTML length bounds',
  async (length) => {
    const f = setup();
    expect(f.input).not.toHaveAttribute('maxLength');
    expect(f.input).not.toHaveAttribute('minLength');
    fireEvent.change(f.input, { target: { value: ` ${'A'.repeat(length)} ` } });
    expect(f.save).toBeEnabled();
    fireEvent.click(f.save);
    await waitFor(() =>
      expect(f.onConfirm).toHaveBeenCalledExactlyOnceWith({
        action: 'update_profile',
        displayName: 'Target',
        username: 'a'.repeat(length),
      })
    );
  }
);
it.each(['bad-name', '_bad', 'bad.name', 'naïve', 'two words'])(
  'blocks changed invalid %s',
  (username) => {
    const f = setup();
    fireEvent.change(f.input, { target: { value: username } });
    expect(f.input).toHaveAttribute('aria-invalid', 'true');
    expect(f.save).toBeDisabled();
    fireEvent.click(f.save);
    expect(f.onConfirm).not.toHaveBeenCalled();
  }
);
it.each(['hehe', 'old-name', 'old.name'])(
  'retains unchanged legacy %s',
  async (username) => {
    const f = setup(username);
    fireEvent.click(f.save);
    await waitFor(() =>
      expect(f.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ username })
      )
    );
  }
);
it('clears a username and permits a trailing underscore', async () => {
  const f = setup('old-name');
  fireEvent.change(f.input, { target: { value: 'a_' } });
  expect(f.save).toBeEnabled();
  fireEvent.change(f.input, { target: { value: '  ' } });
  fireEvent.click(f.save);
  await waitFor(() =>
    expect(f.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ username: null })
    )
  );
});
