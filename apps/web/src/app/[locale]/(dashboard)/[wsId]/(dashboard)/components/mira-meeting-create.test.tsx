import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MiraMeetingCreate } from './mira-meeting-create';

const mocks = vi.hoisted(() => ({ profile: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: await mocks.profile() },
        error: null,
      }),
    },
  }),
}));
vi.mock('@tuturuuu/internal-api/meetings', () => ({
  createWorkspaceMeeting: mocks.create,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MiraMeetingCreate wsId="workspace-1" />
    </QueryClientProvider>
  );
}
describe('Mira meeting creation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not offer creation to an ineligible account', async () => {
    mocks.profile.mockResolvedValue({ email: 'user@example.com' });
    setup();
    expect(await screen.findByText('meeting_restricted')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'create_meeting' })
    ).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('does not offer creation before email verification', async () => {
    mocks.profile.mockResolvedValue({
      email: 'user@tuturuuu.com',
      email_confirmed_at: null,
    });
    setup();
    expect(await screen.findByText('meeting_restricted')).toBeVisible();
    expect(screen.queryByLabelText('meeting_name')).not.toBeInTheDocument();
  });
  it('distinguishes account loading failures and lets the user retry', async () => {
    mocks.profile
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValue({
        email: 'user@tuturuuu.com',
        email_confirmed_at: '2026-01-01T00:00:00Z',
      });
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('load_failed');
    expect(screen.queryByText('meeting_restricted')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByLabelText('meeting_name')).toBeVisible();
  });
  it('creates only after the eligible user submits the form and shows API success', async () => {
    mocks.profile.mockResolvedValue({
      email: 'user@tuturuuu.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    });
    mocks.create.mockResolvedValue({ meeting: { id: 'meeting-1' } });
    setup();
    fireEvent.change(await screen.findByLabelText('meeting_name'), {
      target: { value: 'Project review' },
    });
    fireEvent.change(screen.getByLabelText('meeting_time'), {
      target: { value: '2026-09-15T09:00' },
    });
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'create_meeting' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith('workspace-1', {
        name: 'Project review',
        time: new Date('2026-09-15T09:00').toISOString(),
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'meeting_created'
    );
  });
  it('shows a rejected API response without claiming creation or losing the draft', async () => {
    mocks.profile.mockResolvedValue({
      email: 'user@tuturuuu.com',
      email_confirmed_at: '2026-01-01T00:00:00Z',
    });
    mocks.create.mockRejectedValue(new Error('Forbidden'));
    setup();
    fireEvent.change(await screen.findByLabelText('meeting_name'), {
      target: { value: 'Review' },
    });
    fireEvent.change(screen.getByLabelText('meeting_time'), {
      target: { value: '2026-09-15T09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'create_meeting' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('create_failed');
    expect(screen.getByLabelText('meeting_name')).toHaveValue('Review');
    expect(screen.queryByText('meeting_created')).not.toBeInTheDocument();
  });
});
