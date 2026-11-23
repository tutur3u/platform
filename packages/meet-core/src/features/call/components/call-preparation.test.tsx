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
import { CallPreparation } from './call-preparation';
import { SLOW_HINT_MS, STEP_ADVANCE_MS } from './preparation-steps';

const copy = en.meet.call;
const localized = (child: ReactNode) => (
  <NextIntlClientProvider locale="en" timeZone="UTC" messages={en}>
    {child}
  </NextIntlClientProvider>
);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const spinner = (container: HTMLElement) =>
  container.querySelector('[class*="animate-spin"]');

it('shows the meeting name, one short status line, a quiet progress bar and a way back while preparing', () => {
  const view = render(
    localized(<CallPreparation meetingName="Weekly sync" leaveHref="/home" />)
  );
  const section = view.container.querySelector('section');
  expect(section?.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('Weekly sync')).toBeTruthy();
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toBe(copy.join_step_setup);
  expect(
    screen.getByRole('heading', { level: 1, name: copy.join_step_setup })
  ).toBeTruthy();
  expect(screen.getByTestId('preparation-progress')).toBeTruthy();
  expect(spinner(view.container)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: copy.back_to_meet }).getAttribute('href')
  ).toBe('/home');
  expect(screen.queryByRole('button', { name: copy.join_retry })).toBeNull();
});

it('advances through three human steps and never goes back when busy toggles', () => {
  vi.useFakeTimers();
  const ui = render(localized(<CallPreparation />));
  const status = () => screen.getByRole('status').textContent;
  expect(status()).toBe(copy.join_step_setup);
  act(() => vi.advanceTimersByTime(STEP_ADVANCE_MS));
  expect(status()).toBe(copy.join_step_connecting);
  act(() => vi.advanceTimersByTime(STEP_ADVANCE_MS));
  expect(status()).toBe(copy.join_step_ready);
  ui.rerender(localized(<CallPreparation busy={false} />));
  ui.rerender(localized(<CallPreparation busy />));
  expect(status()).toBe(copy.join_step_ready);
});

it('never uses technical jargon in the waiting, slow or failure copy', () => {
  const jargon =
    /\b(signal|signaling|sfu|turn|token|realtime|real-time|websocket|webrtc)\b/i;
  const keys = Object.keys(copy).filter((key) =>
    /^(join_step_|join_slow_hint|join_loading_slow_title|join_error_|join_connecting_hint|startup_|join_retry|preparing_call)/.test(
      key
    )
  );
  expect(keys.length).toBeGreaterThan(8);
  for (const key of keys)
    expect(String(copy[key as keyof typeof copy]), key).not.toMatch(jargon);
});

it('adds a gentle hint with Try again and a way back after the slow threshold', () => {
  vi.useFakeTimers();
  const onRetry = vi.fn();
  const view = render(
    localized(
      <CallPreparation
        meetingName="Weekly sync"
        description="Hidden once slow"
        onRetry={onRetry}
      />
    )
  );
  expect(screen.queryByText(copy.join_slow_hint)).toBeNull();
  act(() => vi.advanceTimersByTime(SLOW_HINT_MS - 1));
  expect(screen.queryByText(copy.join_slow_hint)).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status').textContent).toBe(
    `${copy.join_loading_slow_title}${copy.join_slow_hint}`
  );
  expect(screen.queryByText('Hidden once slow')).toBeNull();
  expect(spinner(view.container)).toBeNull();
  expect(
    view.container.querySelector('section')?.getAttribute('aria-busy')
  ).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: copy.join_retry }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: copy.back_to_meet })).toBeTruthy();
});

it('keeps recovery copy and actions for settled outcomes', () => {
  const view = render(
    localized(
      <CallPreparation
        busy={false}
        title={copy.join_missing_title}
        description={copy.join_missing_hint}
      >
        <button type="button">Recover</button>
      </CallPreparation>
    )
  );
  expect(
    screen.getByRole('heading', { name: copy.join_missing_title })
  ).toBeTruthy();
  expect(screen.getByText(copy.join_missing_hint)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Recover' })).toBeTruthy();
  expect(spinner(view.container)).toBeNull();
  expect(screen.queryByRole('link', { name: copy.back_to_meet })).toBeNull();
});
