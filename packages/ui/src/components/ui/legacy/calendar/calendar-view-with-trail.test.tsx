import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const settings = {
  timezone: { timezone: 'UTC' },
  workHours: {
    monday: {
      enabled: true,
      timeBlocks: [{ startTime: '09:00', endTime: '17:00' }],
    },
  },
};
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({ settings }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar-clock', () => ({
  useCalendarClock: () => new Date('2026-09-07T11:00:00Z'),
}));
vi.mock('./calendar-view', () => ({ CalendarView: () => null }));
vi.mock('./time-trail', () => ({ TimeTrail: () => null }));

import { HOUR_HEIGHT } from './config';
import { CalendarViewWithTrail } from './calendar-view-with-trail';

let height = 600;
let resize: (() => void) | undefined;
const scrollTo = vi.fn();

beforeEach(() => {
  height = 600;
  scrollTo.mockReset();
  settings.timezone.timezone = 'UTC';
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    () => height
  );
  HTMLElement.prototype.scrollTo = scrollTo as never;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const dates = [new Date('2026-09-07T00:00:00Z')];
const lastTop = () => scrollTo.mock.calls.at(-1)?.[0]?.top as number;

it('opens on the working day when now is comfortably visible', () => {
  render(<CalendarViewWithTrail dates={dates} />);
  expect(lastTop()).toBe(8.5 * HOUR_HEIGHT);
});

it('re-aims when a later timezone moves now below the fold', () => {
  const view = render(<CalendarViewWithTrail dates={dates} />);
  settings.timezone.timezone = 'Asia/Ho_Chi_Minh';
  view.rerender(<CalendarViewWithTrail dates={dates} />);
  expect(lastTop()).toBeCloseTo(18 * HOUR_HEIGHT - 600 / 3);
});

it.each(['wheel', 'scrollbar'] as const)(
  'keeps the position the person scrolled to by %s',
  (input) => {
    const view = render(<CalendarViewWithTrail dates={dates} />);
    const grid = view.container.querySelector<HTMLElement>('#calendar-view')!;
    if (input === 'wheel') fireEvent.wheel(grid);
    grid.scrollTop = 18 * HOUR_HEIGHT;
    fireEvent.scroll(grid);
    settings.timezone.timezone = 'Asia/Ho_Chi_Minh';
    view.rerender(<CalendarViewWithTrail dates={dates} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  }
);

it('treats its own aimed scroll as no user input', () => {
  const view = render(<CalendarViewWithTrail dates={dates} />);
  const grid = view.container.querySelector<HTMLElement>('#calendar-view')!;
  fireEvent.scroll(grid);
  settings.timezone.timezone = 'Asia/Ho_Chi_Minh';
  view.rerender(<CalendarViewWithTrail dates={dates} />);
  expect(scrollTo).toHaveBeenCalledTimes(2);
});

it('drops the person-scrolled hold when the range changes', () => {
  const view = render(<CalendarViewWithTrail dates={dates} />);
  const grid = view.container.querySelector<HTMLElement>('#calendar-view')!;
  grid.scrollTop = 18 * HOUR_HEIGHT;
  fireEvent.scroll(grid);
  view.rerender(
    <CalendarViewWithTrail dates={[new Date('2026-09-14T00:00:00Z')]} />
  );
  expect(scrollTo).toHaveBeenCalledTimes(2);
});

it('waits for a measurable height before scrolling', () => {
  height = 0;
  render(<CalendarViewWithTrail dates={dates} />);
  expect(scrollTo).not.toHaveBeenCalled();
  height = 600;
  act(() => resize?.());
  expect(lastTop()).toBe(8.5 * HOUR_HEIGHT);
});
