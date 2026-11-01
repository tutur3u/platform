import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTaskCardTitleName } from './task-card-open-options';
import { useMinuteClock } from './use-minute-clock';

function DueProbe({ due, enabled }: { due: string; enabled: boolean }) {
  const now = useMinuteClock(enabled);
  return <span>{new Date(due).getTime() < now ? 'overdue' : 'on time'}</span>;
}

describe('useMinuteClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T09:59:30Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a card overdue once its due time passes, without a remount', () => {
    render(<DueProbe due="2026-11-06T10:00:00Z" enabled />);
    expect(screen.getByText('on time')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('overdue')).toBeInTheDocument();
  });

  it('does not re-render cards that opt out', () => {
    let renders = 0;
    function Counter() {
      useMinuteClock(false);
      renders += 1;
      return null;
    }
    render(<Counter />);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(renders).toBe(1);
  });

  it('gives a card that opts out the time it mounted, not a stale shared one', () => {
    // The shared clock last ticked long ago; nothing has subscribed since.
    vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    let seen = 0;
    function Probe() {
      seen = useMinuteClock(false);
      return null;
    }
    render(<Probe />);
    expect(seen).toBe(new Date('2026-11-06T12:00:00Z').getTime());
  });
});

describe('getTaskCardTitleName', () => {
  it('keeps the ticket ID so tasks with the same name stay distinguishable', () => {
    expect(getTaskCardTitleName('Fix login', 'PLA-1')).toBe(
      '[PLA-1] Fix login'
    );
    expect(getTaskCardTitleName('Fix login', 'PLA-2')).toBe(
      '[PLA-2] Fix login'
    );
    expect(getTaskCardTitleName('Fix login', null)).toBe('Fix login');
  });
});
