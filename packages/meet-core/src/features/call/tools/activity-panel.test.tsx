// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { activityTone } from '../stage-layout/activity-tones';
import { ActivityPanel } from './activity-panel';

afterEach(cleanup);

const panel = (props: Partial<Parameters<typeof ActivityPanel>[0]> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivityPanel
        title="Timer"
        icon={() => null}
        closeLabel="Close timer"
        onClose={() => {}}
        {...props}
      >
        <p>body</p>
      </ActivityPanel>
    </NextIntlClientProvider>
  );

it('gives the body 16px padding, 12px gaps and a container for container queries', () => {
  panel();
  const body = screen.getByText('body').parentElement as HTMLElement;
  expect(body.className).toContain('p-4');
  expect(body.className).toContain('gap-3');
  expect(body.className).toContain('@container');
});

it('shows the standard loading, error and retry states in place of the body', () => {
  const retry = vi.fn();
  const view = panel({ state: { kind: 'loading' } });
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByText('body')).toBeNull();
  view.unmount();
  panel({ state: { kind: 'error', title: 'Could not load', onRetry: retry } });
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps a close action and a status in its header outside a stage pane', () => {
  panel({ status: 'Private' });
  expect(screen.getByRole('button', { name: 'Close timer' })).toBeTruthy();
  expect(screen.getByText('Private')).toBeTruthy();
});

it('tints every activity from the shared tokens and never with a raw hue', () => {
  const ids = [
    'tool:polls',
    'tool:timers',
    'tool:quiz',
    'tool:live-qa',
    'tool:live-assessment',
    'tool:live-flashcards',
    'tool:live-game',
    'tool:live-icebreaker',
    'tool:pen-whiteboard',
    'whiteboard',
    'breakouts',
    'programming',
    'document',
  ];
  for (const id of ids) {
    const tone = activityTone(id);
    // One hue for the tile and its icon, from the shared tokens.
    expect(tone).toMatch(/^bg-dynamic-([a-z]+)\/15 text-dynamic-\1$/);
    expect(tone).not.toMatch(/-(red|green|blue|slate|gray)-\d/);
  }
  expect(activityTone('tool:polls')).toBe(
    'bg-dynamic-blue/15 text-dynamic-blue'
  );
  expect(activityTone('tool:timers')).toBe(
    'bg-dynamic-orange/15 text-dynamic-orange'
  );
  expect(activityTone('tool:live-qa')).toBe(
    'bg-dynamic-purple/15 text-dynamic-purple'
  );
  expect(activityTone('unknown')).toBe('bg-muted text-muted-foreground');
});
