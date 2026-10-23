// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { INITIAL_CALL_STATE, reduceCallState } from '../lib/call-state';
import { ADMISSION_WAIT_NOTICE_MS, AdmissionNotice } from './admission-notice';
import { CallPreparation } from './call-preparation';
import { CallConnectionNotice, JoinOutcome } from './join-outcome';
import { Lobby } from './lobby';

const copy = en.meet.call;
function localized(child: ReactNode, locale: 'en' | 'vi' = 'en') {
  return (
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === 'en' ? en : viMessages}
    >
      {child}
    </NextIntlClientProvider>
  );
}
const lobbyProps = {
  defaultDisplayName: 'Test participant',
  meetingName: 'Test meeting',
  connectionStatus: 'open' as const,
  error: null,
  isJoining: false,
  waiting: true,
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  onRetry: vi.fn(),
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it.each(['en', 'vi'] as const)(
  'explains pending admission and supports cancellation in %s',
  (locale) => {
    const messages = locale === 'en' ? en.meet.call : viMessages.meet.call;
    const view = render(localized(<Lobby {...lobbyProps} />, locale));
    expect(screen.getByRole('status').textContent).toContain(
      messages.waiting_explanation
    );
    expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: messages.join_cancel_request })
    );
    expect(lobbyProps.onLeave).toHaveBeenCalledOnce();
    expect(lobbyProps.onJoin).not.toHaveBeenCalled();
  }
);

it('keeps a prolonged admission wait explicit without resending or spinning, then accepts approval', () => {
  vi.useFakeTimers();
  const view = render(localized(<Lobby {...lobbyProps} />));
  act(() => vi.advanceTimersByTime(ADMISSION_WAIT_NOTICE_MS));
  expect(screen.getByText(copy.join_wait_long)).toBeTruthy();
  expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
  expect(lobbyProps.onJoin).not.toHaveBeenCalled();
  expect(lobbyProps.onRetry).not.toHaveBeenCalled();
  const admitted = reduceCallState(
    { ...INITIAL_CALL_STATE, admission: 'waiting' },
    {
      type: 'admission.result',
      admitted: true,
      decidedBy: 'host',
    }
  );
  expect(admitted.admission).toBe('admitted');
  view.rerender(
    localized(
      <Lobby {...lobbyProps} waiting={admitted.admission === 'waiting'} />
    )
  );
  expect(screen.getByText(copy.join_admitted_title)).toBeTruthy();
  expect(screen.queryByText(copy.join_wait_long)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.join_now }));
  expect(lobbyProps.onJoin).toHaveBeenCalledOnce();
});

it('preserves denial and removal reasons instead of reporting that the participant left', () => {
  const waiting = {
    ...INITIAL_CALL_STATE,
    admission: 'waiting' as const,
    selfUserId: 'self',
  };
  const denied = reduceCallState(waiting, {
    type: 'admission.result',
    admitted: false,
    decidedBy: 'host',
  });
  expect(denied.admissionReason).toBe('denied');
  const view = render(
    localized(<JoinOutcome reason={denied.admissionReason!} />)
  );
  expect(
    screen.getByRole('heading', { name: copy.join_denied_title })
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: copy.back_to_meet })).toBeTruthy();
  const removed = reduceCallState(
    { ...waiting, admission: 'admitted' },
    { type: 'participant.removed', userId: 'self', by: 'host' }
  );
  expect(removed.admissionReason).toBe('removed');
  view.rerender(localized(<JoinOutcome reason={removed.admissionReason!} />));
  expect(
    screen.getByRole('heading', { name: copy.join_removed_title })
  ).toBeTruthy();
  expect(screen.queryByText(copy.call_left_title)).toBeNull();
  const ended = reduceCallState(waiting, { type: 'room.ended' });
  expect(ended.ended).toBe(true);
});

it.each(['closed', 'error'] as const)(
  'replaces a stuck connecting state with recovery on transport %s',
  (connectionStatus) => {
    const view = render(
      localized(
        <Lobby
          {...lobbyProps}
          waiting={false}
          isJoining
          connectionStatus={connectionStatus}
        />
      )
    );
    expect(screen.getByText(copy.join_error_title)).toBeTruthy();
    expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: copy.connection_refresh })
    );
    expect(lobbyProps.onRetry).toHaveBeenCalledOnce();
    expect(lobbyProps.onJoin).not.toHaveBeenCalled();
  }
);

it('shows room capacity refusal before ready without leaving a disabled spinner', () => {
  const view = render(
    localized(
      <Lobby
        {...lobbyProps}
        waiting={false}
        isJoining
        error="participant_limit_reached"
      />
    )
  );
  expect(screen.getByText(copy.participant_limit_reached)).toBeTruthy();
  expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
});

it('renders connecting separately from admission and stops preparation animation after its deadline', () => {
  vi.useFakeTimers();
  const view = render(
    localized(<AdmissionNotice waiting={false} connecting />)
  );
  expect(screen.getByText(copy.join_connecting_hint)).toBeTruthy();
  expect(screen.queryByText(copy.waiting_explanation)).toBeNull();
  view.rerender(localized(<CallPreparation />));
  act(() => vi.advanceTimersByTime(30_000));
  expect(
    screen.getByRole('heading', { name: copy.join_loading_slow_title })
  ).toBeTruthy();
  expect(view.container.querySelector('[class*="animate-spin"]')).toBeNull();
  expect(screen.getByRole('link', { name: copy.back_to_meet })).toBeTruthy();
});

it('offers a way back for missing rooms and retry for errors', () => {
  const retry = vi.fn();
  const view = render(localized(<JoinOutcome reason="missing" />));
  expect(
    screen.getByRole('heading', { name: copy.join_missing_title })
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: copy.back_to_meet })).toBeTruthy();
  view.rerender(localized(<JoinOutcome reason="error" onRetry={retry} />));
  fireEvent.click(
    screen.getByRole('button', { name: copy.connection_refresh })
  );
  expect(retry).toHaveBeenCalledOnce();
});

it.each(['closed', 'error'] as const)(
  'offers recovery to an admitted participant after transport %s',
  (status) => {
    const retry = vi.fn();
    render(localized(<CallConnectionNotice status={status} onRetry={retry} />));
    expect(screen.getByRole('status').textContent).toContain(
      copy.join_error_title
    );
    expect(screen.queryByText(copy.reconnecting)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: copy.connection_refresh })
    );
    expect(retry).toHaveBeenCalledOnce();
  }
);
