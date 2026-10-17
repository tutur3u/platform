import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  migrate: vi.fn(),
  actor: {
    actorId: 'actor-a',
    assertActive: vi.fn(),
    lifetime: { active: true },
  },
  workspace: 'root',
}));
vi.mock('@tuturuuu/internal-api/infrastructure', () => ({
  inspectInternalEmployeeAddressMigration: mocks.inspect,
  migrateInternalEmployeeAddress: mocks.migrate,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => mocks.actor,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: mocks.workspace }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { AddressMigrationDialog } from './address-migration-dialog';

const userId = '53581515-5358-4358-8358-535815155359';
const source = 'khoi@xwf.tuturuuu.com';
const destination = 'khoi@tuturuuu.com';
function tree() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AddressMigrationDialog actorId="actor-a" workspaceId="root" />
    </QueryClientProvider>
  );
}
async function inspect() {
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  fireEvent.change(screen.getByLabelText('user_id'), {
    target: { value: userId },
  });
  fireEvent.change(screen.getByLabelText('source'), {
    target: { value: source },
  });
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await screen.findByText('ready');
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.actor.actorId = 'actor-a';
  mocks.workspace = 'root';
  mocks.inspect.mockImplementation(async (tuple) => ({
    status: 'ready',
    ...tuple,
  }));
  mocks.migrate.mockRejectedValue(new Error('lost acknowledgement'));
});
describe('address migration dialog', () => {
  it('requires exact confirmations and keeps recovery after close, reopen and unmount', async () => {
    const mounted = render(tree());
    await inspect();
    expect(screen.getByRole('button', { name: 'migrate' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('confirm_source'), {
      target: { value: source },
    });
    fireEvent.change(screen.getByLabelText('confirm_destination'), {
      target: { value: destination },
    });
    fireEvent.click(screen.getByRole('button', { name: 'migrate' }));
    await screen.findByText('pending');
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
    const sent = mocks.migrate.mock.calls[0]?.[0];
    expect(sent).not.toHaveProperty('actorId');
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(
      screen.queryByRole('button', { name: 'migrate' })
    ).not.toBeInTheDocument();
    mounted.unmount();
    render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByLabelText('user_id')).toHaveValue(userId);
    expect(screen.getByLabelText('source')).toHaveValue(source);
    expect(screen.getByLabelText('source')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
    await waitFor(() => expect(mocks.inspect).toHaveBeenLastCalledWith(sent));
    expect(mocks.migrate).toHaveBeenCalledTimes(1);
  });
  it('offers inspection while default-off runtime denies all readiness', async () => {
    mocks.inspect.mockResolvedValue({ status: 'denied', code: 'not_ready' });
    render(tree());
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    fireEvent.change(screen.getByLabelText('user_id'), {
      target: { value: userId },
    });
    fireEvent.change(screen.getByLabelText('source'), {
      target: { value: source },
    });
    fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
    await screen.findByText('denied');
    expect(screen.getByLabelText('user_id')).toBeEnabled();
    expect(screen.getByLabelText('source')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('source'), {
      target: { value: 'corrected@xwf.tuturuuu.com' },
    });
    expect(screen.getByLabelText('destination')).toHaveValue(
      'corrected@tuturuuu.com'
    );
    expect(
      screen.queryByRole('button', { name: 'migrate' })
    ).not.toBeInTheDocument();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });
  it('retires readiness on a new lifetime for the same actor', async () => {
    const mounted = render(tree());
    await inspect();
    mocks.actor.lifetime = { active: true };
    mounted.rerender(tree());
    expect(screen.queryByText('ready')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByLabelText('source')).toHaveValue('');
    expect(mocks.migrate).not.toHaveBeenCalled();
  });
  it('retires visible state on live actor or workspace replacement', async () => {
    const mounted = render(tree());
    await inspect();
    mocks.actor.actorId = 'actor-b';
    mounted.rerender(tree());
    expect(screen.queryByText('ready')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'open' })
    ).not.toBeInTheDocument();
    mocks.actor.actorId = 'actor-a';
    mocks.workspace = 'elsewhere';
    mounted.rerender(tree());
    expect(
      screen.queryByRole('button', { name: 'open' })
    ).not.toBeInTheDocument();
    expect(mocks.migrate).not.toHaveBeenCalled();
  });
});
