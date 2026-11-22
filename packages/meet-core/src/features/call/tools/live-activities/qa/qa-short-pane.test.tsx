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

const send = vi.fn();
function mount() {
  send.mockClear();
  let receive: (message: MeetRealtimeServerMessage) => void = () => {};
  const client = createLiveQaClient({
    send,
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

const footer = () => composer().closest('form') as HTMLFormElement;
const button = (name: string) => screen.getByRole('button', { name });

it('keeps the full composer in a 480 pixel pane', () => {
  mount();
  expect(composer().getAttribute('rows')).toBe('2');
  expect(composer().getAttribute('placeholder')).toBe(t.composer_placeholder);
  expect(button(t.attach_file)).toBeTruthy();
  expect(button(t.ask).textContent).toContain(t.ask);
  expect(screen.getByText('0/400')).toBeTruthy();
  expect(screen.getByText('Second?')).toBeTruthy();
});

it('is one row in a short pane with the field, Attach and Send always in view', () => {
  body = SHORT;
  mount();
  expect(composer().getAttribute('rows')).toBe('1');
  expect(composer().getAttribute('placeholder')).toBe(
    t.composer_placeholder_short
  );
  // No focus, no typing: every control is already there, as icons.
  expect(button(t.attach_image)).toBeTruthy();
  expect(button(t.attach_file)).toBeTruthy();
  const send = button(t.ask);
  expect(send.textContent).toBe('');
  expect(send).toHaveProperty('disabled', true);
  // The whole row is in one line.
  const row = composer().closest('div.flex') as HTMLElement;
  expect(row.contains(send)).toBe(true);
  expect(row.contains(button(t.attach_file))).toBe(true);
  // Both questions stay in the list.
  expect(screen.getByText('First question?')).toBeTruthy();
  expect(screen.getByText('Second?')).toBeTruthy();
});

it('never changes layout for focus, typing or Escape', () => {
  body = SHORT;
  mount();
  const before = footer().outerHTML.replace(/disabled=""/g, '');
  fireEvent.focus(composer());
  fireEvent.pointerDown(composer());
  fireEvent.keyDown(composer(), { key: 'Escape' });
  fireEvent.blur(composer());
  expect(composer().getAttribute('rows')).toBe('1');
  expect(footer().outerHTML.replace(/disabled=""/g, '')).toBe(before);
});

it('keeps the row stable while a press lands on a card button', () => {
  body = SHORT;
  mount();
  const node = composer();
  const before = footer().outerHTML;
  const answer = screen.getAllByRole('button', { name: t.answer })[0]!;
  // What a mouse press does: pointerdown, focus moves, then the click.
  fireEvent.pointerDown(answer);
  fireEvent.focusIn(answer);
  fireEvent.mouseDown(answer);
  expect(composer()).toBe(node);
  expect(footer().outerHTML).toBe(before);
  fireEvent.click(answer);
  // The card's own handler ran, and the composer is untouched.
  expect(screen.getByPlaceholderText(t.answer_placeholder)).toBeTruthy();
  expect(composer()).toBe(node);
  expect(composer().getAttribute('rows')).toBe('1');
  expect(footer().outerHTML).toBe(before);
});

it('fires the Attach and Send handlers from the compact row', async () => {
  body = SHORT;
  mount();
  const click = vi
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(() => {});
  fireEvent.click(button(t.attach_image));
  fireEvent.click(button(t.attach_file));
  expect(click).toHaveBeenCalledTimes(2);
  click.mockRestore();
  fireEvent.change(composer(), { target: { value: 'My question' } });
  fireEvent.click(button(t.ask));
  await waitFor(() =>
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'qa.ask', text: 'My question' })
    )
  );
});

it('lets the field grow to three lines and then scroll', () => {
  body = SHORT;
  mount();
  expect(composer().className).toContain('min-h-9');
  // 3 lines of 20px and 16px of padding, then it scrolls.
  expect(composer().className).toContain('max-h-[4.75rem]');
  expect(composer().className).toContain('overflow-y-auto');
  fireEvent.change(composer(), { target: { value: 'a\nb\nc\nd\ne' } });
  expect(composer().getAttribute('rows')).toBe('1');
});

it('announces the counter to assistive technology and badges it only near the limit', () => {
  body = SHORT;
  mount();
  const described = composer().getAttribute('aria-describedby') ?? '';
  expect(document.getElementById(described)?.className).toContain('sr-only');
  const badge = () =>
    [...footer().querySelectorAll('span.shrink-0')].find((node) =>
      /\d+\/400/.test(node.textContent ?? '')
    );
  fireEvent.change(composer(), { target: { value: 'x'.repeat(10) } });
  expect(badge()).toBeUndefined();
  fireEvent.change(composer(), { target: { value: 'x'.repeat(330) } });
  expect(badge()?.textContent).toBe('330/400');
});

it('keeps the controls mounted across the short-pane height', () => {
  mount();
  const tabs = screen.getByRole('tablist');
  const wrapper = tabs.closest('div[class*="space-y-3"]') as HTMLElement;
  const list = screen.getByText('First question?').closest('ul')
    ?.parentElement as HTMLElement;
  expect(list.contains(tabs)).toBe(true);
  expect(wrapper.className).toContain('sticky');
  const field = composer();
  resize(SHORT);
  expect(screen.getByRole('tablist')).toBe(tabs);
  expect(list.contains(tabs)).toBe(true);
  expect(wrapper.className).not.toContain('sticky');
  // The composer swaps its layout at the threshold and nowhere else.
  expect(composer().getAttribute('rows')).toBe('1');
  resize(TALL);
  expect(screen.getByRole('tablist')).toBe(tabs);
  expect(wrapper.className).toContain('sticky');
  expect(composer().getAttribute('rows')).toBe('2');
  expect(field).toBeTruthy();
});

it('keeps the full composer in the full-screen dialog opened from a short pane', () => {
  body = SHORT;
  mount();
  fireEvent.click(button('Full screen'));
  const dialog = screen.getByRole('dialog');
  const field = within(dialog).getByLabelText(t.composer_label);
  expect(field.getAttribute('rows')).toBe('2');
  expect(field.getAttribute('placeholder')).toBe(t.composer_placeholder);
  expect(
    within(dialog).getByRole('button', { name: t.attach_file })
  ).toBeTruthy();
  expect(
    within(dialog).getByRole('button', { name: t.ask }).textContent
  ).toContain(t.ask);
});

it('keeps Escape for an answer composer', () => {
  mount();
  fireEvent.click(screen.getAllByRole('button', { name: t.answer })[0]!);
  const answer = screen.getByPlaceholderText(t.answer_placeholder);
  fireEvent.keyDown(answer, { key: 'Escape' });
  expect(screen.queryByPlaceholderText(t.answer_placeholder)).toBeNull();
});

it('scrolls a focused card below the sticky controls in a tall pane only', () => {
  mount();
  const list = screen.getByText('First question?').closest('ul')
    ?.parentElement as HTMLElement;
  expect(list.className).toContain(
    'scroll-pt-[calc(var(--qa-controls-height)+4px)]'
  );
  expect(list.style.getPropertyValue('--qa-controls-height')).not.toBe('');
  resize(SHORT);
  expect(list.style.getPropertyValue('--qa-controls-height')).toBe('');
});
