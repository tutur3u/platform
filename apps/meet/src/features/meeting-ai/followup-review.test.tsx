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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { FollowupReview } from './followup-review';

const mocks = vi.hoisted(() => ({ context: vi.fn(), create: vi.fn() }));
vi.mock('@tuturuuu/internal-api', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api')>()),
  getMeetFollowupContext: mocks.context,
  getMeetFollowupConflicts: async () => ({ count: 0 }),
  createMeetFollowup: mocks.create,
}));
const wsId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';
const suggestion = {
  key: 'session:event:0',
  kind: 'event' as const,
  title: 'Review design',
  evidence: 'Review at 9 tomorrow',
  owner: null,
  timeText: '9 tomorrow',
  startLocal: '2026-09-15T09:00',
  endLocal: '2026-09-15T10:00',
  timezone: 'Asia/Ho_Chi_Minh',
};
function view() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <FollowupReview
          suggestion={suggestion}
          sourceUrl="https://meet.tuturuuu.com/source"
          wsId={wsId}
          meetingId="meeting"
          onClose={() => undefined}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    user: { id: userId, display_name: 'Requester' },
    timezone: 'America/New_York',
    workspaceId: wsId,
    workspaces: [
      { id: wsId, name: 'Personal', personal: true, access_type: 'member' },
    ],
    boards: [],
    lists: [],
  });
  mocks.create.mockResolvedValue({
    url: `https://calendar.tuturuuu.com/${wsId}`,
  });
});
afterEach(cleanup);
it('uses the verified account and saved timezone, creates only after review and blocks duplicate submission', async () => {
  const first = view();
  const add = await screen.findByRole('button', { name: 'Add to calendar' });
  expect(mocks.create).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Timezone') as HTMLInputElement).value).toBe(
    'America/New_York'
  );
  expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe(
    '2026-09-14T22:00'
  );
  fireEvent.click(add);
  await screen.findByText('Saved. Open it below to review the result.');
  expect(mocks.create).toHaveBeenCalledWith(
    wsId,
    'meeting',
    expect.objectContaining({
      userId,
      workspaceId: wsId,
      timezone: 'America/New_York',
      start: '2026-09-14T22:00',
    })
  );
  first.unmount();
  view();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add to calendar' })
  );
  await screen.findByText('Saved. Open it below to review the result.');
  expect(mocks.create).toHaveBeenCalledOnce();
});
it('does not submit an ambiguous daylight-saving time', async () => {
  view();
  await screen.findByRole('button', { name: 'Add to calendar' });
  fireEvent.change(screen.getByLabelText('Starts'), {
    target: { value: '2026-11-01T01:30' },
  });
  fireEvent.change(screen.getByLabelText('Ends'), {
    target: { value: '2026-11-01T03:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('daylight-saving')
  );
  expect(mocks.create).not.toHaveBeenCalled();
});

it('allows retry after a confirmed pre-write rejection', async () => {
  const { InternalApiError } = await import('@tuturuuu/internal-api');
  mocks.create.mockRejectedValueOnce(
    new InternalApiError('Destination unavailable', 403, 'FOLLOWUP_NOT_SAVED')
  );
  view();
  const add = await screen.findByRole('button', { name: 'Add to calendar' });
  fireEvent.click(add);
  await screen.findByText(
    'Nothing was saved. Check the selected destination and try again.'
  );
  expect(
    localStorage.getItem(`meet-followup:${userId}:${suggestion.key}`)
  ).toBeNull();
  fireEvent.click(add);
  await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
});
