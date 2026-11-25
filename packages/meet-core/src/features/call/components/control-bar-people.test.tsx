// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { NextIntlClientProvider } from 'next-intl';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { type CallPanel, ControlBar } from './control-bar';

const noAction = () => undefined;
const PEOPLE = 'People (2)';

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
  vi.restoreAllMocks();
});

function bar(
  activePanel: CallPanel,
  props: Partial<ComponentProps<typeof ControlBar>> = {}
) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <NuqsTestingAdapter>
        <ControlBar
          activePanel={activePanel}
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
          {...props}
        />
      </NuqsTestingAdapter>
    </NextIntlClientProvider>
  );
}

const rendered = [{ width: 40, height: 40 }] as unknown as DOMRectList;
const lead = () =>
  screen.getByRole('group', { name: messages.meet.call.control_bar })
    .firstElementChild as HTMLElement;

it('keeps people at the trailing end without the redesigned room', () => {
  render(bar(null));
  const people = screen.getAllByRole('button', { name: PEOPLE });
  expect(people).toHaveLength(1);
  expect(lead().contains(people[0]!)).toBe(false);
});

it('puts people right of the clocks from lg up, trailing on phones', () => {
  render(bar(null, { peopleAtStart: true }));
  const [start, end] = screen.getAllByRole('button', { name: PEOPLE });
  expect(lead().contains(start!)).toBe(true);
  const clocks = within(lead()).getByText('42 min left');
  const context = within(lead()).getByText('On the whiteboard');
  expect(
    clocks.compareDocumentPosition(start!) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  expect(
    start!.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
  // The trailing copy serves phones only.
  expect(end!.parentElement?.className).toContain('lg:hidden');
});

it('returns focus to the visible people control when its panel closes', () => {
  const { rerender } = render(bar('participants', { peopleAtStart: true }));
  const [start, end] = screen.getAllByRole('button', { name: PEOPLE });
  // jsdom lays nothing out; mark the leading copy as the rendered one.
  vi.spyOn(start!, 'getClientRects').mockReturnValue(rendered);
  (document.activeElement as HTMLElement | null)?.blur();
  rerender(bar(null, { peopleAtStart: true }));
  expect(document.activeElement).toBe(start);
  expect(document.activeElement).not.toBe(end);
});

it('leaves focus alone when it already moved elsewhere', () => {
  const { rerender } = render(bar('participants', { peopleAtStart: true }));
  const [start] = screen.getAllByRole('button', { name: PEOPLE });
  vi.spyOn(start!, 'getClientRects').mockReturnValue(rendered);
  const [chat] = screen.getAllByRole('button', { name: 'Chat' });
  chat!.focus();
  rerender(bar('chat', { peopleAtStart: true }));
  expect(document.activeElement).toBe(chat);
});
