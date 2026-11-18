// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { getPollCountdownState } from '../lib/poll-countdown';
import { PollStageResultsCard, PollStageToast } from './poll-stage-toast';

afterEach(cleanup);

it('shows the live prompt, localized countdown, privacy, and panel action', () => {
  const onOpenPanel = vi.fn();
  const message = 'Poll live \u2014 vote in the panel';

  render(
    <PollStageToast
      message={message}
      countdown={{
        state: getPollCountdownState(90_000, 42_000),
        label: '00:48 left',
      }}
      privacy={{ kind: 'anonymous', label: 'Anonymous' }}
      openPanelLabel="Open poll panel"
      onOpenPanel={onOpenPanel}
    />
  );

  expect(screen.getByRole('status').textContent).toBe(message);
  expect(screen.getByRole('timer').textContent).toBe('00:48 left');
  expect(screen.getByText('Anonymous')).toBeTruthy();

  const button = screen.getByRole('button', { name: 'Open poll panel' });
  expect(button.getAttribute('type')).toBe('button');
  fireEvent.click(button);
  expect(onOpenPanel).toHaveBeenCalledOnce();
});

it('keeps untimed polls actionable without a countdown', () => {
  render(
    <PollStageToast
      message="Poll live"
      privacy={{ kind: 'named', label: 'Named' }}
      openPanelLabel="Open panel"
      onOpenPanel={vi.fn()}
    />
  );
  expect(screen.queryByRole('timer')).toBeNull();
  expect(screen.getByRole('button', { name: 'Open panel' })).toBeTruthy();
});

it('renders localized percentages and bounded bars for shared results', () => {
  render(
    <PollStageResultsCard
      title="Shared poll results"
      question="When should we meet?"
      locale="fr"
      options={[
        { id: 'a', label: 'Monday', percentage: 62.5 },
        { id: 'b', label: 'Tuesday', percentage: 140 },
        { id: 'c', label: 'Wednesday', percentage: Number.NaN },
      ]}
    />
  );

  const results = screen.getByRole('region', { name: 'Shared poll results' });
  expect(within(results).getByText('When should we meet?')).toBeTruthy();

  const rows = within(results).getAllByRole('listitem');
  for (const [index, percentage] of [63, 100, 0].entries()) {
    const row = rows[index]!;
    const localized = new Intl.NumberFormat('fr', { style: 'percent' }).format(
      percentage / 100
    );
    expect(
      within(row).getByText(localized.replace(/\s/g, ' ')).classList
    ).toContain('tabular-nums');
    expect(
      row.querySelector<HTMLElement>('[aria-hidden="true"] > div')?.style.width
    ).toBe(String(percentage).concat('%'));
  }
});

it('omits the results surface when no options were shared', () => {
  render(
    <PollStageResultsCard
      title="Shared poll results"
      question="When should we meet?"
      locale="en"
      options={[]}
    />
  );
  expect(screen.queryByRole('region')).toBeNull();
});
