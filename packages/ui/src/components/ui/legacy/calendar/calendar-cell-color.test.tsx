import { fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { expect, it, vi } from 'vitest';

dayjs.extend(utc);
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({
    addEmptyEvent: vi.fn(),
    addEmptyEventWithDuration: vi.fn(),
    isDragging: true,
    setIsDragging: vi.fn(),
    scheduleTaskAsEvent: vi.fn(),
    readOnly: false,
  }),
}));
vi.mock('./settings/settings-context', () => ({
  useCalendarSettings: () => ({
    settings: {
      appearance: { timeFormat: '24h' },
      timezone: { timezone: 'UTC' },
    },
  }),
}));

import { CalendarCell } from './calendar-cell';

it('gives the duration badge the same opaque contrast colors as its drag card', () => {
  const { container } = render(
    <div data-testid="scroll">
      <CalendarCell date="2026-09-07" hour={9} />
    </div>
  );
  const parent = screen.getByTestId('scroll');
  Object.defineProperties(parent, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 200 },
  });
  parent.getBoundingClientRect = () => ({
    top: 0,
    bottom: 200,
    left: 0,
    right: 200,
    width: 200,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const cell = container.querySelector('.calendar-cell')!;
  cell.getBoundingClientRect = () => ({
    top: 0,
    bottom: 80,
    left: 0,
    right: 200,
    width: 200,
    height: 80,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.mouseDown(cell, { button: 0, clientY: 20 });
  fireEvent.mouseMove(document, { clientY: 80 });
  const badge = screen.getByText(/^(?:\d+h(?: \d+m)?|\d+m)$/);
  expect(badge).toHaveStyle({ backgroundColor: '#2196f3', color: '#000000' });
  expect(badge.closest('.border-l-2')).toHaveStyle({
    backgroundColor: '#2196f3',
    color: '#000000',
  });
});
