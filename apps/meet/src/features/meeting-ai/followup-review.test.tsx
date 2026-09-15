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
import type { MeetingFollowup } from './followup-types';

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
function view(selected: MeetingFollowup = suggestion) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <FollowupReview
          suggestion={selected}
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    user: { id: userId, display_name: 'Requester' },
    timezone: 'America/New_York',
    workspaceId: wsId,
    workspaces: [
      { id: wsId, name: 'Personal', personal: true, access_type: 'member' },
    ],
    members: [],
    calendars: [{ id: wsId, name: 'My calendar', calendar_type: 'primary' }],
    boards: [],
    lists: [],
  });
  mocks.create.mockResolvedValue({
    url: `https://calendar.tuturuuu.com/${wsId}`,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function chooseCalendar() {
  fireEvent.click(await screen.findByRole('combobox', { name: 'Calendar' }));
  fireEvent.click(await screen.findByRole('option', { name: 'My calendar' }));
}
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
  await chooseCalendar();
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
  await chooseCalendar();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Add to calendar' })
  );
  await screen.findByText('Saved. Open it below to review the result.');
  expect(mocks.create).toHaveBeenCalledOnce();
});
it('does not submit an ambiguous daylight-saving time', async () => {
  view();
  await screen.findByRole('button', { name: 'Add to calendar' });
  await chooseCalendar();
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
  await chooseCalendar();
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

it('creates a task with a reviewed board, list and a different verified assignee', async () => {
  const other = '33333333-3333-4333-8333-333333333333';
  const board = '44444444-4444-4444-8444-444444444444';
  const list = '55555555-5555-4555-8555-555555555555';
  mocks.context.mockResolvedValue({
    user: { id: userId, display_name: null, email: 'requester@example.com' },
    timezone: 'Asia/Ho_Chi_Minh',
    workspaceId: wsId,
    workspaces: [
      { id: wsId, name: 'Personal', personal: true, access_type: 'member' },
    ],
    boards: [{ id: board, name: 'Delivery' }],
    lists: [{ id: list, name: 'Next up', status: 'not_started' }],
    members: [
      {
        id: other,
        displayName: 'Colleague',
        email: 'colleague@example.com',
        avatarUrl: null,
      },
    ],
    calendars: [],
  });
  mocks.create.mockResolvedValue({
    url: `https://tasks.tuturuuu.com/${wsId}/tasks/${list}`,
  });
  view({ ...suggestion, kind: 'task', owner: 'Colleague', ownerId: other });
  await screen.findByText(/requester@example.com/);
  fireEvent.click(await screen.findByRole('combobox', { name: 'Task board' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Delivery' }));
  const lists = await screen.findByRole('combobox', { name: 'Task list' });
  await waitFor(() =>
    expect((lists as HTMLButtonElement).disabled).toBe(false)
  );
  fireEvent.click(lists);
  fireEvent.click(await screen.findByRole('option', { name: 'Next up' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Assign suggested owner: Colleague' })
  );
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Reviewed description' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith(
    wsId,
    'meeting',
    expect.objectContaining({
      userId,
      workspaceId: wsId,
      boardId: board,
      listId: list,
      assigneeIds: [other],
      description: 'Reviewed description\n\nhttps://meet.tuturuuu.com/source',
      priority: 'normal',
    })
  );
});
