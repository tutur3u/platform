import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountPasswordResetDialog } from './account-password-reset-dialog';

const mocks = vi.hoisted(() => ({ reset: vi.fn() }));
vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  resetAccountPassword: mocks.reset,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${values.email}:${values.password}` : key,
}));

function prepare(password = 'Synthetic-password-123!') {
  const onOpenChange = vi.fn();
  render(<AccountPasswordResetDialog open onOpenChange={onOpenChange} />);
  fireEvent.change(screen.getByLabelText('password_recovery.email_label'), {
    target: { value: ' SYNTHETIC@example.com ' },
  });
  fireEvent.change(screen.getByLabelText('new_password'), {
    target: { value: password },
  });
  return {
    onOpenChange,
    submit: screen.getByRole('button', { name: 'password_recovery.confirm' }),
  };
}

describe('platform account password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects passwords outside the authoritative 12–72 character range', () => {
    const { submit } = prepare('x'.repeat(73));
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('new_password'), {
      target: { value: 'x'.repeat(72) },
    });
    expect(submit).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('new_password'), {
      target: { value: 'x'.repeat(11) },
    });
    expect(submit).toBeDisabled();
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('retains the submitted identity and credential until server completion', async () => {
    let finish: () => void = () => {
      throw new Error('No pending request');
    };
    mocks.reset.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { onOpenChange, submit } = prepare();
    fireEvent.click(submit);
    expect(mocks.reset).toHaveBeenCalledExactlyOnceWith({
      action: 'reset_password',
      email: 'synthetic@example.com',
      newPassword: 'Synthetic-password-123!',
    });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText('password_recovery.email_label')
    ).toBeDisabled();
    expect(screen.getByLabelText('new_password')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'generate_password' })
    ).toBeDisabled();
    fireEvent.click(submit);
    expect(mocks.reset).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() =>
      expect(
        screen.getByLabelText('dialog.reset_password.handoff_label')
      ).toHaveValue(
        'dialog.reset_password.handoff_message:synthetic@example.com:Synthetic-password-123!'
      )
    );
  });

  it('generates a replacement password locally and sends the selected value', async () => {
    mocks.reset.mockResolvedValue(undefined);
    const { submit } = prepare();
    fireEvent.click(screen.getByRole('button', { name: 'generate_password' }));
    const input = screen.getByLabelText<HTMLInputElement>('new_password');
    const generated = input.value;
    expect(generated).toHaveLength(20);
    expect(input).toHaveAttribute('type', 'text');
    expect(mocks.reset).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(mocks.reset).toHaveBeenCalledExactlyOnceWith({
        action: 'reset_password',
        email: 'synthetic@example.com',
        newPassword: generated,
      })
    );
  });

  it('keeps failed resets editable without showing a success handoff', async () => {
    mocks.reset.mockRejectedValue(new Error('Synthetic refusal'));
    const { submit, onOpenChange } = prepare();
    fireEvent.click(submit);
    await waitFor(() => expect(submit).not.toBeDisabled());
    expect(
      screen.queryByLabelText('dialog.reset_password.handoff_label')
    ).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('new_password')).not.toBeDisabled();
  });
});
