// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({
  getMeetPublicInfoSettings: mocks.read,
  updateMeetPublicInfoSettings: mocks.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { MeetingPublicSettings } from './meeting-public-settings';

const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.read.mockResolvedValue({ publicLinkPreview: false, title: 'Demo' });
});
afterEach(cleanup);
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MeetingPublicSettings meetingId={id} />
    </QueryClientProvider>
  );
}
it('shows the actual persisted public preview after the host enables it', async () => {
  mocks.update.mockResolvedValue({ publicLinkPreview: true, title: 'Demo' });
  show();
  await screen.findByText('private_status');
  fireEvent.click(screen.getByRole('switch'));
  await screen.findByText('public_status');
  expect(mocks.update).toHaveBeenCalledWith(id, true);
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  expect(screen.getByText('Demo')).toBeTruthy();
});
it('keeps visibility private and reports a failed save', async () => {
  mocks.update.mockRejectedValue(new Error('unavailable'));
  show();
  await screen.findByText('private_status');
  fireEvent.click(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('save_error')
  );
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  expect(screen.queryByText('Demo')).toBeNull();
});
