// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { ControlBar } from './control-bar';

const noAction = () => undefined;

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the leading clocks first in the bar, from lg up only', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ControlBar
          activePanel={null}
          cameraOn
          handRaised={false}
          micOn
          onLeave={noAction}
          onToggleCamera={noAction}
          onToggleHand={noAction}
          onToggleMic={noAction}
          onTogglePanel={noAction}
          onToggleScreen={noAction}
          participantCount={2}
          screenOn={false}
          unreadChat={0}
          waitingCount={0}
          context={<span>On the whiteboard</span>}
          leading={<span>42 min left</span>}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
  const bar = screen.getByRole('group', {
    name: messages.meet.call.control_bar,
  });
  const clocks = within(bar).getByText('42 min left');
  // The clocks sit in the first column, before the context label.
  const lead = bar.firstElementChild as HTMLElement;
  expect(lead.contains(clocks)).toBe(true);
  // Below lg the column is not rendered, so it neither re-centres the
  // controls nor adds a gap on phones.
  expect(lead.className).toMatch(/(^|\s)hidden(\s|$)/);
  expect(lead.className).toContain('lg:flex');
  expect(
    clocks.compareDocumentPosition(within(bar).getByText('On the whiteboard')) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});
