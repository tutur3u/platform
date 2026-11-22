// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ResizableCallPanel } from '../components/resizable-call-panel';
import { LiveActivityPanelFrame } from '../tools/live-activities/panel-frame';
import { StageLayoutView } from './stage-layout-view';
import { useStageLayout } from './use-stage-layout';

afterEach(() => {
  cleanup();
  localStorage.clear();
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
      peopleCount={2}
      stage={null}
      activities={controller.openIds.map((id) => ({
        id,
        title: id,
        icon: () => null,
        content:
          id === 'frame' ? (
            <LiveActivityPanelFrame
              title="Frame"
              subtitle="Running"
              state={{ kind: 'ready' }}
            >
              <p>frame body</p>
            </LiveActivityPanelFrame>
          ) : (
            <ResizableCallPanel label="Plain">
              <p>plain body</p>
            </ResizableCallPanel>
          ),
      }))}
    />
  );
}

it('lets existing panels fill their pane and share its header', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Harness />
    </NextIntlClientProvider>
  );
  act(() => {
    controller.open('frame');
    controller.open('plain');
  });
  // No side-panel resize handle: the layout owns sizes.
  expect(screen.getAllByRole('separator')).toHaveLength(1);
  const pane = document.querySelector('[data-pane-id]') as HTMLElement;
  // The activity's subtitle becomes the chip in its pane header.
  expect(within(pane).getByText('Running')).toBeTruthy();
  expect(within(pane).getAllByRole('heading', { level: 2 })).toHaveLength(1);
  expect(screen.getByText('frame body')).toBeTruthy();
  expect(screen.getByText('plain body')).toBeTruthy();
});
