// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { CallPreparation } from './call-preparation';

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

it('shows only the meeting name, one status line, a spinner and Back while preparing', () => {
  const view = render(
    localized(<CallPreparation meetingName="Weekly sync" leaveHref="/home" />)
  );
  const section = view.container.querySelector('section');
  expect(section?.getAttribute('aria-busy')).toBe('true');
  expect(screen.getByText('Weekly sync')).toBeTruthy();
  const status = screen.getByRole('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toBe(copy.preparing_call);
  expect(
    screen.getByRole('heading', { level: 1, name: copy.preparing_call })
  ).toBeTruthy();
  expect(spinner(view.container)).toBeTruthy();
  expect(
    screen.getByRole('link', { name: copy.back_to_meet }).getAttribute('href')
  ).toBe('/home');
  expect(screen.queryByText(copy.resource_limits_hint)).toBeNull();
  expect(section?.textContent).toBe(
    `Weekly sync${copy.preparing_call}${copy.back_to_meet}`
  );
});

it('replaces the status line with the slow message after the deadline', () => {
  vi.useFakeTimers();
  const view = render(
    localized(
      <CallPreparation
        meetingName="Weekly sync"
        description="Hidden once slow"
      />
    )
  );
  expect(screen.getByText('Hidden once slow')).toBeTruthy();
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole('status').textContent).toBe(
    copy.join_loading_slow_title
  );
  expect(screen.queryByText(copy.preparing_call)).toBeNull();
  expect(screen.queryByText('Hidden once slow')).toBeNull();
  expect(spinner(view.container)).toBeNull();
  expect(
    view.container.querySelector('section')?.getAttribute('aria-busy')
  ).toBe('false');
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
