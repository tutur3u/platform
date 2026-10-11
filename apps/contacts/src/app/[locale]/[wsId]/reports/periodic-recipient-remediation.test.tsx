import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodicRecipientRemediation } from './periodic-recipient-remediation';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  actor: {
    actorId: 'actor-a',
    lifetime: { active: true },
    assertActive: vi.fn(),
  },
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getWorkspaceUser: mocks.get,
  updateWorkspaceUser: mocks.update,
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  InternalApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => mocks.actor,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const user = {
  id: 'user-1',
  display_name: 'Student',
  email: null,
  full_name: 'Student',
};
function setup(overrides: { canUpdateUsers?: boolean; epoch?: number } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const intent = {
    actor: mocks.actor,
    wsId: 'workspace-1',
    userId: user.id,
    epoch: 1,
  };
  const props: ComponentProps<typeof PeriodicRecipientRemediation> = {
    intent,
    wsId: intent.wsId,
    epoch: 1,
    canUpdateUsers: true,
    onClose,
    onSaved,
    ...overrides,
  };
  const result = render(
    <QueryClientProvider client={client}>
      <PeriodicRecipientRemediation {...props} />
    </QueryClientProvider>
  );
  return {
    ...result,
    onClose,
    onSaved,
    client,
    props,
    change: (next: Partial<typeof props>) =>
      result.rerender(
        <QueryClientProvider client={client}>
          <PeriodicRecipientRemediation {...props} {...next} />
        </QueryClientProvider>
      ),
  };
}
async function fillEmail(email = 'student@example.com') {
  fireEvent.change(await screen.findByLabelText('recipient_email'), {
    target: { value: email },
  });
}
function confirmEmail() {
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'recipient_confirm_email' })
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockReset();
  mocks.update.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  mocks.actor.lifetime.active = true;
  mocks.actor.assertActive.mockImplementation(() => {
    if (!mocks.actor.lifetime.active) throw new Error('Account changed');
  });
  mocks.get.mockResolvedValue({ ...user });
  mocks.update.mockResolvedValue({ message: 'ok' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verified recipient remediation', () => {
  it('does not fetch or display an editor without update permission', () => {
    const result = setup({ canUpdateUsers: false });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(result.onClose).toHaveBeenCalledOnce();
  });
  it('shows a skeleton until the bound user has loaded', async () => {
    const pending = deferred<typeof user>();
    mocks.get.mockReturnValue(pending.promise);
    setup();
    expect(screen.getByLabelText('recipient_loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.queryByLabelText('recipient_email')).not.toBeInTheDocument();
    pending.resolve(user);
    expect(await screen.findByLabelText('recipient_email')).toHaveValue('');
    expect(mocks.get).toHaveBeenCalledWith('workspace-1', 'user-1');
  });
  it('requires confirmation, rechecks the user and saves only the two fields', async () => {
    const result = setup();
    await fillEmail();
    expect(
      screen.getByRole('button', { name: 'recipient_save' })
    ).toBeDisabled();
    confirmEmail();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    expect(mocks.update).toHaveBeenCalledWith('workspace-1', 'user-1', {
      display_name: 'Student',
      email: 'student@example.com',
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(result.onSaved).toHaveBeenCalledOnce();
    expect(result.onClose).toHaveBeenCalledOnce();
  });
  it('does not overwrite an email changed on the server while editing', async () => {
    mocks.get
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, email: 'other@example.com' });
    setup();
    await fillEmail();
    confirmEmail();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    expect(await screen.findByText('recipient_changed')).toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('invalidates confirmation after another email edit', async () => {
    setup();
    await fillEmail();
    confirmEmail();
    await fillEmail('different@example.com');
    expect(
      screen.getByRole('button', { name: 'recipient_save' })
    ).toBeDisabled();
  });
  it('closes and removes sensitive inputs when the epoch changes', async () => {
    const result = setup();
    await fillEmail();
    result.change({ epoch: 2 });
    expect(screen.queryByLabelText('recipient_email')).not.toBeInTheDocument();
    expect(result.onClose).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not send the update when closed during the pre-save read', async () => {
    const pending = deferred<typeof user>();
    mocks.get.mockResolvedValueOnce(user).mockReturnValueOnce(pending.promise);
    const result = setup();
    await fillEmail();
    confirmEmail();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    result.change({ intent: null });
    await act(async () => {
      pending.resolve(user);
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(result.onSaved).not.toHaveBeenCalled();
  });
  it('rejects a response for another user', async () => {
    mocks.get.mockResolvedValue({ ...user, id: 'other-user' });
    setup();
    expect(
      await screen.findByText('recipient_load_failed')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('recipient_email')).not.toBeInTheDocument();
  });
  it('closes on permission denial rather than keeping the profile editable', async () => {
    const { InternalApiError } = await import('@tuturuuu/internal-api/client');
    mocks.get.mockRejectedValue(new InternalApiError('Forbidden', 403));
    const result = setup();
    await waitFor(() => expect(result.onClose).toHaveBeenCalledOnce());
    expect(screen.queryByLabelText('recipient_email')).not.toBeInTheDocument();
  });
  it('allows correcting the name while leaving an existing missing email unchanged', async () => {
    setup();
    fireEvent.change(await screen.findByLabelText('recipient_display_name'), {
      target: { value: 'Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('workspace-1', 'user-1', {
        display_name: 'Updated',
        email: null,
      })
    );
  });
  it('saves a display-name correction without email-change confirmation', async () => {
    mocks.get.mockResolvedValue({ ...user, email: 'student@example.com' });
    setup();
    fireEvent.change(await screen.findByLabelText('recipient_display_name'), {
      target: { value: 'Updated' },
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith('workspace-1', 'user-1', {
        display_name: 'Updated',
        email: 'student@example.com',
      })
    );
  });
  it('discards a successful response after the editor has been closed', async () => {
    const pending = deferred<{ message: string }>();
    mocks.update.mockReturnValue(pending.promise);
    const result = setup();
    await fillEmail();
    confirmEmail();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    result.change({ intent: null });
    await act(async () => {
      pending.resolve({ message: 'ok' });
    });
    expect(result.onSaved).not.toHaveBeenCalled();
  });
  it('closes on update permission denial', async () => {
    const { InternalApiError } = await import('@tuturuuu/internal-api/client');
    mocks.update.mockRejectedValue(new InternalApiError('Forbidden', 403));
    const result = setup();
    await fillEmail();
    confirmEmail();
    fireEvent.click(screen.getByRole('button', { name: 'recipient_save' }));
    await waitFor(() => expect(result.onClose).toHaveBeenCalledOnce());
    expect(result.onSaved).not.toHaveBeenCalled();
  });
  it('guards against duplicate submission while an update is pending', async () => {
    const pending = deferred<{ message: string }>();
    mocks.update.mockReturnValue(pending.promise);
    setup();
    await fillEmail();
    confirmEmail();
    const button = screen.getByRole('button', { name: 'recipient_save' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    pending.resolve({ message: 'ok' });
  });
});
