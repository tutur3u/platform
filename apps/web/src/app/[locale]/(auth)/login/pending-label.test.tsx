// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PendingLabel, usePendingPhase } from './pending-label';

afterEach(() => vi.useRealTimers());

describe('usePendingPhase', () => {
  it('moves to more specific phases while an action stays pending', () => {
    vi.useFakeTimers();
    const { rerender, result } = renderHook(
      ({ active }) => usePendingPhase(active),
      { initialProps: { active: true } }
    );

    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(2);

    rerender({ active: false });
    expect(result.current).toBe(0);
  });
});

describe('PendingLabel', () => {
  it('keeps every phase in one cell and shows only the current one', () => {
    render(<PendingLabel labels={['One', 'Two', 'Three']} phase={1} />);

    expect(screen.getByText('One')).toHaveClass('invisible');
    expect(screen.getByText('Two')).not.toHaveClass('invisible');
    expect(screen.getByText('Two')).not.toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Three')).toHaveAttribute('aria-hidden', 'true');
  });
});
