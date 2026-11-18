// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { getPollCountdownState } from '../lib/poll-countdown';
import {
  PollCountdownPill,
  PollIndicatorPill,
  PollLiveDot,
} from './poll-countdown-pill';

afterEach(cleanup);

it('keeps a static live dot under reduced motion', () => {
  const { container } = render(<PollLiveDot />);
  expect(
    container.querySelector('[aria-hidden="true"] .bg-dynamic-green')
  ).toBeTruthy();
  expect(
    container.querySelector('.motion-reduce\\:animate-none')?.classList
  ).toContain('animate-ping');
});

it('uses tabular numbers and applies emphasis only before expiry', () => {
  const { rerender } = render(
    <PollCountdownPill state={getPollCountdownState(60_000, 30_000)} />
  );
  const timer = screen.getByRole('timer');
  expect(timer.textContent).toBe('00:30');
  expect(timer.classList).toContain('tabular-nums');
  expect(timer.classList).not.toContain('border-destructive/40');

  rerender(
    <PollCountdownPill
      state={getPollCountdownState(60_000, 31_000)}
      label="00:29 left"
    />
  );
  expect(timer.textContent).toBe('00:29 left');
  expect(timer.classList).toContain('border-destructive/40');

  rerender(<PollCountdownPill state={getPollCountdownState(60_000, 60_000)} />);
  expect(timer.textContent).toBe('00:00');
  expect(timer.classList).not.toContain('border-destructive/40');
});

it.each([
  ['anonymous', 'Anonymous', 'shield'],
  ['named', 'Named', 'user-round'],
  ['results-hidden', 'Results hidden', 'eye-off'],
] as const)(
  'renders %s with its supplied label and icon',
  (kind, label, icon) => {
    render(<PollIndicatorPill kind={kind} label={label} />);
    const svg = screen.getByText(label).querySelector('svg');
    expect(svg?.classList).toContain('lucide-'.concat(icon));
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  }
);
