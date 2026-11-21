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
import type { ReactNode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { fleetStateResponseSchema } from '../fleet/contract';
import { fleetResponseFixture } from '../fleet/fleet-fixture';
import { setSnooze } from '../fleet/snooze';
import { I18nProvider } from '../i18n';
import { Inbox } from './inbox';
import { LaneOutcomes } from './lane-outcomes';
import { FreshnessBanner } from './page-states';

vi.mock('../fleet/server', () => ({
  loadFleet: vi.fn(),
  answerFleetDecision: vi.fn(),
  loadReviewPreview: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo='),
}));

const now = Date.parse('2026-11-22T00:30:00.000Z');

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider locale="en">{children}</I18nProvider>
    </QueryClientProvider>
  );
}

function snapshot() {
  const raw = fleetResponseFixture(now);
  (raw.state.decisions as unknown[]).push({
    id: 'review-ship',
    kind: 'review',
    title: 'Approve the Ship mockup?',
    why: 'The Ship lane builds from it next.',
    urgency: 'normal',
    review: {
      mockupUrl: 'https://claude.ai/artifact/abc',
      preview: {
        source: 'asset',
        assetId: 'a'.repeat(64),
        contentType: 'image/png',
      },
    },
    createdAt: new Date(now - 60_000).toISOString(),
  });
  Object.assign(raw.state.counts, {
    recovered: 2,
    quotaRecovered: 6,
    cancelled: 31,
  });
  return fleetStateResponseSchema.parse(raw);
}

afterEach(cleanup);

test('splits Needs you from FYI and renders reviews with the mockup link', async () => {
  render(wrap(<Inbox snapshot={snapshot()} now={now} showFyi interactive />));
  const needs = screen.getByText('Needs you').parentElement as HTMLElement;
  expect(within(needs).getByText('3')).toBeTruthy();
  expect(
    screen.getByText('Roll back the Calendar Worker deploy?')
  ).toBeTruthy();
  expect(screen.getByText('Approve the Ship mockup?')).toBeTruthy();
  const open = screen.getByRole('link', { name: 'Open full mockup' });
  expect(open.getAttribute('href')).toBe('https://claude.ai/artifact/abc');
  expect(open.getAttribute('rel')).toContain('noopener');
  expect(
    await screen.findByAltText('Preview of Approve the Ship mockup?')
  ).toBeTruthy();
  // FYI: the open FYI ask and the decision answered on WhatsApp.
  expect(screen.getByText('Daily CI sample recorded')).toBeTruthy();
  expect(screen.getByText('Answered on WhatsApp')).toBeTruthy();
  expect(screen.getByText('Your recent answers')).toBeTruthy();
});

test('Request changes opens a notes box before anything is sent', () => {
  render(wrap(<Inbox snapshot={snapshot()} now={now} showFyi interactive />));
  fireEvent.click(screen.getByRole('button', { name: /Request changes/ }));
  const notes = screen.getByPlaceholderText('What should change?');
  expect(screen.getByRole('button', { name: 'Send changes' })).toHaveProperty(
    'disabled',
    true
  );
  fireEvent.change(notes, { target: { value: 'Wider cards' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send changes' }));
  expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();
});

test('numbers options, fills the recommended one and keys pick an option', () => {
  render(wrap(<Inbox snapshot={snapshot()} now={now} showFyi interactive />));
  const recommended = screen.getByRole('button', { name: /Roll back now/ });
  expect(recommended.textContent).toContain('1');
  expect(recommended.textContent).toContain('Recommended');
  const card = recommended.closest('[data-inbox-card]') as HTMLElement;
  card.focus();
  fireEvent.keyDown(card, { key: '2' });
  expect(within(card).getByRole('button', { name: /Undo/ })).toBeTruthy();
});

test('Today counts settled lanes apart from failures', () => {
  render(wrap(<LaneOutcomes state={snapshot().state} />));
  expect(screen.getByText('39')).toBeTruthy();
  expect(screen.getByText('cancelled duplicates')).toBeTruthy();
  expect(screen.getByText('meet-signaling')).toBeTruthy();
});

test('tells a paused publisher apart from an offline device', () => {
  const state = snapshot();
  const banner = (reason: 'old' | 'unavailable') =>
    render(
      wrap(
        <FreshnessBanner
          state={{ kind: 'stale', snapshot: state, reason }}
          generatedAt={new Date(now - 2 * 3_600_000).toISOString()}
          checkedAt={new Date(now - 20_000).toISOString()}
          machine="M4"
          now={now}
          retrying={false}
          onRetry={() => {}}
        />
      )
    );
  banner('old');
  expect(screen.getByText('Fleet publisher paused on M4')).toBeTruthy();
  cleanup();
  banner('unavailable');
  expect(screen.getByText('This device is offline')).toBeTruthy();
});

test('J moves through asks, sign-ins and reviews in order', () => {
  render(wrap(<Inbox snapshot={snapshot()} now={now} showFyi interactive />));
  const first = screen
    .getByText('Roll back the Calendar Worker deploy?')
    .closest('[data-inbox-card]') as HTMLElement;
  first.focus();
  fireEvent.keyDown(first, { key: 'j' });
  expect(document.activeElement?.textContent).toContain('GitHub');
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'j' });
  expect(document.activeElement?.textContent).toContain(
    'Approve the Ship mockup?'
  );
});

test('a queued answer survives the card moving into Snoozed', () => {
  const data = snapshot();
  const view = render(
    wrap(<Inbox snapshot={data} now={now} showFyi interactive />)
  );
  fireEvent.click(screen.getByRole('button', { name: /Roll back now/ }));
  expect(screen.getByRole('button', { name: /Undo/ })).toBeTruthy();
  const card = screen
    .getByRole('button', { name: /Undo/ })
    .closest('[data-inbox-card]');
  act(() => setSnooze('roll-back', now + 60_000));
  view.rerender(
    wrap(<Inbox snapshot={data} now={now + 1} showFyi interactive />)
  );
  // The same element, moved under Snoozed, still holds its pending answer.
  expect(
    screen
      .getByText('Roll back the Calendar Worker deploy?')
      .closest('[data-inbox-card]')
  ).toBe(card);
  expect(card?.textContent).toContain('Undo');
  act(() => setSnooze('roll-back', null));
});
