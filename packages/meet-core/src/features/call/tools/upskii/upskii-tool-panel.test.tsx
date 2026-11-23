// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import type {
  MeetRealtimeClientMessage,
  MeetRealtimeServerMessage,
} from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../../apps/meet/messages/vi.json';
import { upskiiTool } from './definition';
import { closeUpskiiRoom, handleUpskiiMessage } from './upskii-store';
import { UpskiiToolPanel } from './upskii-tool-panel';

const listUpskiiContent = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/upskii-content', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listUpskiiContent,
}));
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, title }: { value: string; title: string }) => (
    <svg role="img" aria-label={title} data-value={value} />
  ),
}));

const meetingId = 'upskii-panel';
const send = vi.fn<(message: MeetRealtimeClientMessage) => boolean>(() => true);
const ready = (role: 'host' | 'speaker') =>
  ({
    type: 'ready',
    role,
    userId: 'self',
    roomId: 'room',
    admission: 'admitted',
  }) as unknown as MeetRealtimeServerMessage;
const deliver = (message: MeetRealtimeServerMessage) =>
  act(() => handleUpskiiMessage(meetingId, message, send));
const lessonUrl = 'https://upskii.com/classes/c1/lessons/l4';
const presentation = {
  item: {
    kind: 'assessment' as const,
    id: 'a1',
    title: 'AI check-in',
    classTitle: 'EduFest',
    url: 'https://upskii.com/classes/c1/assessments/a1',
  },
  presenterId: 'host',
  startedAt: '2026-12-05T08:00:00Z',
  revision: 1,
};

function renderPanel(locale: 'en' | 'vi' = 'en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? enMessages : viMessages}
        onError={(error) => {
          throw error;
        }}
      >
        <UpskiiToolPanel meetingId={meetingId} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  send.mockClear();
  listUpskiiContent.mockReset();
});
afterEach(() => {
  cleanup();
  closeUpskiiRoom(meetingId);
});

it('names the activity with a full message key', () => {
  expect(upskiiTool).toMatchObject({
    id: 'upskii',
    label: 'meet.call.upskii.title',
  });
});

it('never reads Upskii for a participant and shows only what the room shares', () => {
  deliver(ready('speaker'));
  renderPanel();
  expect(screen.getByText('Nothing presented yet')).toBeTruthy();

  deliver({ type: 'upskii.presentation', presentation });
  expect(screen.getByRole('heading', { name: 'AI check-in' })).toBeTruthy();
  expect(screen.getByText('Scan to take the assessment')).toBeTruthy();
  const open = screen.getByRole('link', { name: 'Open in Upskii' });
  expect(open.getAttribute('href')).toBe(presentation.item.url);
  expect(open.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.queryByRole('button', { name: 'Stop presenting' })).toBeNull();
  expect(listUpskiiContent).not.toHaveBeenCalled();
});

it('never renders a link off the Upskii origin, whatever the room holds', () => {
  deliver(ready('speaker'));
  renderPanel();
  deliver({
    type: 'upskii.presentation',
    presentation: {
      ...presentation,
      item: { ...presentation.item, url: 'javascript:alert(1)' },
    },
  });
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText("This link can't be opened from Meet.")).toBeTruthy();
});

it('tells an unlinked presenter where to link Upskii', async () => {
  listUpskiiContent.mockRejectedValue(
    new InternalApiError('Not linked', 404, 'NOT_LINKED')
  );
  deliver(ready('host'));
  renderPanel('vi');
  expect(await screen.findByText('Chưa liên kết Upskii')).toBeTruthy();
  expect(
    screen.getByText('Liên kết Upskii trong Cài đặt → Tích hợp.')
  ).toBeTruthy();
});

it('lets a presenter pick a class and present a lesson to the room', async () => {
  listUpskiiContent.mockImplementation(async ({ kind }: { kind: string }) =>
    kind === 'classes'
      ? {
          items: [
            {
              id: 'c1',
              title: 'EduFest',
              kind: 'class',
              url: 'https://upskii.com/classes/c1',
              updatedAt: null,
              classId: null,
            },
          ],
          nextCursor: null,
        }
      : {
          items: [
            {
              id: 'l4',
              title: 'Responsible AI in your class',
              kind: 'lesson',
              url: lessonUrl,
              updatedAt: null,
              classId: 'c1',
            },
          ],
          nextCursor: null,
        }
  );
  deliver(ready('host'));
  renderPanel();
  fireEvent.click(await screen.findByRole('button', { name: 'EduFest' }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: /Responsible AI in your class/,
    })
  );
  expect(listUpskiiContent).toHaveBeenCalledWith({
    kind: 'lessons',
    classId: 'c1',
    cursor: null,
  });
  const set = send.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === 'upskii.present.set');
  expect(set).toMatchObject({
    item: {
      kind: 'lesson',
      id: 'l4',
      title: 'Responsible AI in your class',
      classTitle: 'EduFest',
      url: lessonUrl,
    },
  });
});

it('shows the room refusing a change without hiding the presentation', () => {
  deliver(ready('host'));
  renderPanel();
  deliver({ type: 'upskii.presentation', presentation });
  fireEvent.click(screen.getByRole('button', { name: 'Stop presenting' }));
  const clear = send.mock.calls
    .map(([message]) => message)
    .find((message) => message.type === 'upskii.present.clear') as
    | { requestId?: string }
    | undefined;
  deliver({
    type: 'error',
    error: 'permission_denied',
    requestId: clear?.requestId,
  } as MeetRealtimeServerMessage);
  expect(screen.getByRole('alert').textContent).toBe(
    'Only hosts and co-hosts can present.'
  );
  expect(screen.getByRole('heading', { name: 'AI check-in' })).toBeTruthy();
});
