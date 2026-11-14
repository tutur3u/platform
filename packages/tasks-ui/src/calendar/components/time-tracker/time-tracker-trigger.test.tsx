import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeTrackerTrigger } from './time-tracker-trigger';

const labels = { idle: 'Timer label', running: 'Running label' };

describe('TimeTrackerTrigger', () => {
  it('names the idle chip with its label', () => {
    const onClick = vi.fn();
    render(
      <TimeTrackerTrigger
        isRunning={false}
        elapsedTime={0}
        onClick={onClick}
        labels={labels}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Timer label' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('states a running session in text beside the elapsed time', () => {
    render(
      <TimeTrackerTrigger
        isRunning
        elapsedTime={754}
        onClick={vi.fn()}
        labels={labels}
      />
    );
    const chip = screen.getByRole('button', {
      name: 'Timer label: Running label 12:34',
    });
    expect(chip.textContent).toContain('12:34');
    expect(chip.textContent).toContain('Running label');
  });

  it('falls back to English labels without a host translation', () => {
    render(<TimeTrackerTrigger isRunning elapsedTime={5} onClick={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Time tracker: Running 00:05' })
    ).toBeTruthy();
  });
});
