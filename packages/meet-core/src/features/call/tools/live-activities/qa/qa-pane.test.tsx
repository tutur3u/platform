// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
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
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const t = messages.meet.call.live_activities;
let controller: ReturnType<typeof useStageLayout>;
const client = createLiveQaClient({
  send: vi.fn(),
  subscribe: () => () => {},
});

function Harness() {
  controller = useStageLayout({
    accountId: 'u',
    meetingId: 'm',
    isAvailable: () => true,
    tier: 'desktop',
  });
  return (
    <StageLayoutView
      controller={controller}
      peopleCount={1}
      stage={null}
      activities={controller.openIds.map((id) => ({
        id,
        title: id === 'qa' ? t.qa.title : id,
        icon: () => null,
        content:
          id === 'qa' ? <QaPanel meetingId="meeting" /> : <p>other pane</p>,
      }))}
    />
  );
}

it('keeps the Q&A header actions and full screen working inside a pane', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <LiveQaClientContext value={client}>
          <Harness />
        </LiveQaClientContext>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  act(() => {
    controller.open('qa');
    controller.open('other');
  });
  const pane = document.querySelector('[data-pane-id]') as HTMLElement;
  // The pane header carries the live chip and the full screen action; the
  // panel brings no second title or close button of its own.
  expect(within(pane).getAllByRole('heading', { level: 2 })).toHaveLength(1);
  expect(within(pane).getAllByRole('button', { name: /^Close / })).toHaveLength(
    1
  );
  fireEvent.click(within(pane).getByRole('button', { name: t.fullscreen }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText(t.qa.title)).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole('button', { name: t.exit_fullscreen })
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  // The board is back in its pane, still mounted.
  expect(controller.openIds).toEqual(['qa', 'other']);
  expect(screen.getByPlaceholderText(t.qa.composer_placeholder)).toBeTruthy();
});
