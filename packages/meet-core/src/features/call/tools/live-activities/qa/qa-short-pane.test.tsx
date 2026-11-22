// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
const TALL = { width: 600, height: 435 };
const SHORT = { width: 600, height: 300 };
let body = TALL;
const observers: { target: Element; run: () => void }[] = [];
const resize = (size: typeof body) => {
  body = size;
  act(() => {
    for (const observer of observers) observer.run();
  });
};
beforeEach(() => {
  body = TALL;
  observers.length = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (!(target as HTMLElement).dataset.activityId) return;
        const run = () =>
          this.callback(
            [{ target, contentRect: body } as ResizeObserverEntry],
            this as unknown as ResizeObserver
          );
        observers.push({ target, run });
        run();
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
  // A draft keeps it open when the person presses elsewhere.
  fireEvent.change(composer(), { target: { value: 'My question' } });
  fireEvent.pointerDown(document.body);
  expect(composer().getAttribute('rows')).toBe('2');
  // With the draft gone, the next press outside folds it.
  fireEvent.change(composer(), { target: { value: '' } });
  fireEvent.pointerDown(document.body);
  expect(composer().getAttribute('rows')).toBe('1');
});

it('keeps the controls mounted across the short-pane height', () => {
  mount();
  const tabs = screen.getByRole('tablist');
  const wrapper = tabs.closest('div[class*="space-y-3"]') as HTMLElement;
  const list = screen.getByText('First question?').closest('ul')
    ?.parentElement as HTMLElement;
  // In both sizes the controls live in the list's container.
  expect(list.contains(tabs)).toBe(true);
  expect(wrapper.className).toContain('sticky');
  resize(SHORT);
  expect(screen.getByRole('tablist')).toBe(tabs);
  expect(list.contains(tabs)).toBe(true);
  expect(wrapper.className).not.toContain('sticky');
  resize(TALL);
  expect(screen.getByRole('tablist')).toBe(tabs);
  expect(wrapper.className).toContain('sticky');
});

it('keeps the full composer in the full-screen dialog opened from a short pane', () => {
  body = SHORT;
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  const dialog = screen.getByRole('dialog');
  const field = within(dialog).getByLabelText(t.composer_label);
  expect(field.getAttribute('rows')).toBe('2');
  expect(field.getAttribute('placeholder')).toBe(t.composer_placeholder);
  const attach = within(dialog).getByRole('button', { name: t.attach_file });
  expect(attach.parentElement?.className).not.toContain('hidden');
});

const attach = () => screen.getByRole('button', { name: t.attach_file });
const rowHidden = () => attach().parentElement?.className.includes('hidden');

it('opens on a press inside the form and lets an Attach click land', () => {
  body = SHORT;
  mount();
  const click = vi
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(() => {});
  expect(composer().getAttribute('rows')).toBe('1');
  // Safari and iOS: the button takes a press, the field never gets a blur
  // that could fold the row before the click.
  fireEvent.pointerDown(attach());
  expect(composer().getAttribute('rows')).toBe('2');
  expect(rowHidden()).toBe(false);
  fireEvent.click(attach());
  expect(click).toHaveBeenCalledTimes(1);
  expect(rowHidden()).toBe(false);
  click.mockRestore();
});

it('never folds from anything inside the form', () => {
  body = SHORT;
  mount();
  fireEvent.focus(composer());
  fireEvent.blur(composer(), { relatedTarget: null });
  fireEvent.pointerUp(attach());
  fireEvent.blur(attach(), { relatedTarget: null });
  expect(composer().getAttribute('rows')).toBe('2');
  // Moving between the field and its buttons keeps it open too.
  fireEvent.blur(composer(), { relatedTarget: attach() });
  fireEvent.focus(attach());
  expect(composer().getAttribute('rows')).toBe('2');
});

it('folds on a press outside the form', () => {
  body = SHORT;
  mount();
  fireEvent.focus(composer());
  expect(composer().getAttribute('rows')).toBe('2');
  fireEvent.pointerDown(document.body);
  expect(composer().getAttribute('rows')).toBe('1');
});

it('folds when focus moves to something outside the form', () => {
  body = SHORT;
  mount();
  const outside = document.createElement('button');
  document.body.append(outside);
  fireEvent.focus(composer());
  act(() => {
    outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  });
  expect(composer().getAttribute('rows')).toBe('1');
  outside.remove();
});

it('folds on Escape in the composer', () => {
  body = SHORT;
  mount();
  fireEvent.focus(composer());
  fireEvent.keyDown(composer(), { key: 'Escape' });
  expect(composer().getAttribute('rows')).toBe('1');
});

it('stays open while there is a draft, whatever happens outside', () => {
  body = SHORT;
  mount();
  fireEvent.focus(composer());
  fireEvent.change(composer(), { target: { value: 'My question' } });
  fireEvent.pointerDown(document.body);
  fireEvent.keyDown(composer(), { key: 'Escape' });
  expect(composer().getAttribute('rows')).toBe('2');
});

it('listens outside the form only while it is open and removes its listeners', () => {
  body = SHORT;
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  const added = () =>
    add.mock.calls.filter(
      ([type]) => type === 'pointerdown' || type === 'focusin'
    ).length;
  const removed = () =>
    remove.mock.calls.filter(
      ([type]) => type === 'pointerdown' || type === 'focusin'
    ).length;
  mount();
  const before = added();
  fireEvent.focus(composer());
  expect(added()).toBeGreaterThan(before);
  // Folding removes them...
  const afterOpen = removed();
  fireEvent.pointerDown(document.body);
  expect(removed()).toBeGreaterThan(afterOpen);
  // ...and so does unmounting while open.
  fireEvent.focus(composer());
  const beforeUnmount = removed();
  cleanup();
  expect(removed()).toBeGreaterThan(beforeUnmount);
  add.mockRestore();
  remove.mockRestore();
});

it('scrolls a focused card below the sticky controls in a tall pane only', () => {
  mount();
  const list = screen.getByText('First question?').closest('ul')
    ?.parentElement as HTMLElement;
  expect(list.className).toContain('scroll-pt-(--qa-controls-height)');
  expect(list.style.getPropertyValue('--qa-controls-height')).not.toBe('');
  resize(SHORT);
  expect(list.style.getPropertyValue('--qa-controls-height')).toBe('');
});
