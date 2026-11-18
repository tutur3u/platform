// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  readMeetCallRating: mocks.read,
  updateMeetCallRating: mocks.update,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.toastError },
}));

import { EndedMeetingRating } from './ended-meeting-rating';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderRating() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <EndedMeetingRating accountId="account" meetingId="meeting" />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const option = (value: number) =>
  screen.getByRole('radio', {
    name: messages.meet.call.rating_option.replace('{value}', String(value)),
  });

it('hides the rating when the room refuses this viewer', async () => {
  mocks.read.mockRejectedValue(new Error('Forbidden'));
  renderRating();
  await waitFor(() => expect(mocks.read).toHaveBeenCalled());
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('saves a rating and replaces it on a repeat update', async () => {
  mocks.read.mockResolvedValue({ rating: null });
  mocks.update.mockImplementation(async (_id: string, value: number) => ({
    rating: value,
  }));
  renderRating();
  await screen.findByRole('radiogroup');
  fireEvent.click(option(4));
  await waitFor(() =>
    expect(option(4).getAttribute('aria-checked')).toBe('true')
  );
  fireEvent.click(option(2));
  await waitFor(() =>
    expect(option(2).getAttribute('aria-checked')).toBe('true')
  );
  expect(option(4).getAttribute('aria-checked')).toBe('false');
  expect(mocks.update.mock.calls).toEqual([
    ['meeting', 4],
    ['meeting', 2],
  ]);
});

it('restores the saved value and reports a failed save', async () => {
  mocks.read.mockResolvedValue({ rating: 3 });
  mocks.update.mockRejectedValue(new Error('Forbidden'));
  renderRating();
  await screen.findByRole('radiogroup');
  fireEvent.click(option(5));
  await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  expect(option(3).getAttribute('aria-checked')).toBe('true');
  expect(option(5).getAttribute('aria-checked')).toBe('false');
});
