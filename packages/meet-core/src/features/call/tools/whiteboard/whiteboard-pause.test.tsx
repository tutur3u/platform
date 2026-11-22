// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../apps/meet/messages/en.json';
import { StageLayoutView } from '../../stage-layout/stage-layout-view';
import { useStageLayout } from '../../stage-layout/use-stage-layout';
import { WhiteboardPanel } from './whiteboard-panel';
import * as store from './whiteboard-store';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

let controller: ReturnType<typeof useStageLayout>;
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
        title: id,
        icon: () => null,
        content: id === 'board' ? <WhiteboardPanel meetingId="m" /> : <p>x</p>,
      }))}
    />
  );
}

it('stops following the room while its pane is hidden and catches up when shown', () => {
  const live = new Set<() => void>();
  vi.spyOn(store, 'subscribeWhiteboard').mockImplementation((_id, listener) => {
    live.add(listener);
    return () => live.delete(listener);
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
  act(() => {
    controller.open('board');
    controller.open('other');
  });
  expect(live.size).toBe(1);
  // Maximizing the other pane hides the board without unmounting it.
  act(() => controller.maximize(controller.layout.focusedPaneId));
  expect(live.size).toBe(0);
  act(() => controller.maximize(null));
  expect(live.size).toBe(1);
});
