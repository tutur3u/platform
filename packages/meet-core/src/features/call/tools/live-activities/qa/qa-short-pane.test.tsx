// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { MeetRealtimeServerMessage } from '@tuturuuu/realtime/meet';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../../apps/meet/messages/en.json';
import { StageLayoutView } from '../../../stage-layout/stage-layout-view';
import { useStageLayout } from '../../../stage-layout/use-stage-layout';
import { LiveQaClientContext, QaPanel } from './qa-panel';
import { createLiveQaClient } from './qa-store';

vi.mock('@tuturuuu/internal-api', () => ({
  readMeetChatFile: vi.fn(),
  uploadMeetChatFile: vi.fn(),
  discardMeetChatFile: vi.fn(async () => ({ ok: true })),
}));

const t = messages.meet.call.live_activities.qa;
// The size a pane body measures; the pane adds 2 for its border and 45 for
// its header.
let body = { width: 600, height: 435 };
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if ((target as HTMLElement).dataset.activityId)
          this.callback(
            [{ target, contentRect: body } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
      }
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const question = (text: string, upvotes: number) => ({
  id: crypto.randomUUID(),
  participantId: 'x',
  authorName: 'Lan',
  text,
  upvotes: Array.from({ length: upvotes }, (_, n) => `u${n}`),
  answered: false,
  hidden: false,
  createdAt: '2026-11-23T07:58:00Z',
  answers: [],
});

function Harness({
  client,
}: {
  client: ReturnType<typeof createLiveQaClient>;
}) {
  const stage = useStageLayout({
    accountId: 'u',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  controller = stage;
  return (
    <LiveQaClientContext value={client}>
      <StageLayoutView
        controller={stage}
        peopleCount={1}
        stage={null}
        activities={stage.openIds.map((id) => ({
          id,
          title: 'Live Q&A',
          icon: () => null,
          content: <QaPanel meetingId="meeting" />,
        }))}
      />
    </LiveQaClientContext>
  );
}
let controller: ReturnType<typeof useStageLayout>;

function mount() {
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send: vi.fn(),
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <Harness client={client} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  act(() => controller.open('qa'));
  act(() =>
    receive({
      type: 'qa.snapshot',
      snapshot: {
        questions: [question('First question?', 3), question('Second?', 2)],
      },
      self: { actor: 'me', participantId: 'me' },
    } as MeetRealtimeServerMessage)
  );
}

const composer = () => screen.getByLabelText(t.composer_label);

it('scrolls the questions above a composer that is the last thing in the pane', () => {
  mount();
  const form = composer().closest('form') as HTMLElement;
  const footer = form.parentElement as HTMLElement;
  const list = screen.getByText('First question?').closest('ul')
    ?.parentElement as HTMLElement;
  expect(list.className).toContain('overflow-y-auto');
  expect(list.className).toContain('min-h-0');
  // The composer follows the list and nothing follows the composer.
  expect(list.nextElementSibling).toBe(footer);
  expect(footer.nextElementSibling).toBeNull();
  expect(footer.className).not.toContain('sticky');
  expect(footer.className).toContain('shrink-0');
});

it('keeps the full composer in a 480 pixel pane', () => {
  body = { width: 600, height: 435 };
  mount();
  expect(composer().getAttribute('rows')).toBe('2');
  expect(screen.getByRole('button', { name: t.attach_file })).toBeTruthy();
  expect(screen.getByText('Second?')).toBeTruthy();
});

it('folds an idle composer to one line in a short pane and opens it on focus', () => {
  body = { width: 600, height: 300 };
  mount();
  // Both questions stay in the list; the composer is a single line.
  expect(screen.getByText('First question?')).toBeTruthy();
  expect(screen.getByText('Second?')).toBeTruthy();
  expect(composer().getAttribute('rows')).toBe('1');
  expect(composer().className).toContain('min-h-9');
  // The one-line prompt is short, so it does not wrap in the folded field.
  expect(composer().getAttribute('placeholder')).toBe(
    t.composer_placeholder_short
  );
  fireEvent.focus(composer());
  expect(composer().getAttribute('rows')).toBe('2');
  expect(composer().getAttribute('placeholder')).toBe(t.composer_placeholder);
  // A draft keeps it open when focus moves away.
  fireEvent.change(composer(), { target: { value: 'My question' } });
  fireEvent.blur(composer());
  expect(composer().getAttribute('rows')).toBe('2');
  fireEvent.change(composer(), { target: { value: '' } });
  fireEvent.blur(composer());
  expect(composer().getAttribute('rows')).toBe('1');
});

it('scrolls the sort tabs with the questions only in a short pane', () => {
  const sortInList = () => {
    const list = screen.getByText('First question?').closest('ul')
      ?.parentElement as HTMLElement;
    return list.contains(screen.getByRole('tablist'));
  };
  body = { width: 600, height: 435 };
  mount();
  expect(sortInList()).toBe(false);
  cleanup();
  body = { width: 600, height: 300 };
  mount();
  expect(sortInList()).toBe(true);
});
