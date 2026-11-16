// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../../../../../../messages/en.json';
import vi_ from '../../../../../../../../../messages/vi.json';
import {
  DayOverviewCards,
  DayOverviewFollowUps,
  DayOverviewTrace,
} from './day-overview-block';
import { parseDayOverview } from './parse-day-overview';

const at = (time: string, day = '2026-11-16') => `${day}T${time}:00+07:00`;
const overdue = Array.from({ length: 6 }, (_, index) => ({
  id: `t-${index}`,
  name: `Overdue task ${index}`,
  priority: index === 0 ? 'critical' : 'high',
  dueDate: at('09:00', '2026-11-13'),
}));
const day = parseDayOverview({
  success: true,
  date: '2026-11-16',
  wsId: 'personal',
  durationMs: 840,
  calendar: {
    events: [
      {
        id: 'home',
        title: 'Home',
        start: at('00:00'),
        end: at('00:00', '2026-11-17'),
      },
      {
        id: 'focus',
        title: 'Focus block',
        start: at('09:30'),
        end: at('11:30'),
      },
    ],
  },
  tasks: { dueOnDay: [], overdue, counts: { dueOnDay: 0, overdue: 30 } },
})!;

function renderIn(locale: 'en' | 'vi', node: React.ReactNode) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="UTC"
      messages={locale === 'en' ? en : vi_}
    >
      {node}
    </NextIntlClientProvider>
  );
}

describe('day overview cards', () => {
  it('deep-links every event and task and shows free gaps', () => {
    renderIn('en', <DayOverviewCards day={day} />);
    expect(
      screen.getByRole('link', { name: 'Open Focus block in Calendar' })
    ).toHaveAttribute(
      'href',
      '/personal/calendar?eventId=focus&date=2026-11-16'
    );
    expect(
      screen.getByRole('link', { name: 'Open Home in Calendar' })
    ).toHaveAttribute(
      'href',
      '/personal/calendar?eventId=home&date=2026-11-16'
    );
    expect(
      screen.getByRole('link', { name: 'Open Overdue task 0 in Tasks' })
    ).toHaveAttribute('href', '/personal/tasks/t-0');
    const gaps = screen.getAllByTestId('day-overview-gap');
    expect(gaps.map((gap) => gap.textContent)).toEqual([
      '09:00 – 09:30Free · 30m',
      '11:30 – 18:00Free · 6h 30m',
    ]);
  });

  it('previews four overdue tasks and links to the rest', () => {
    renderIn('en', <DayOverviewCards day={day} />);
    expect(screen.getAllByRole('link', { name: /in Tasks$/ })).toHaveLength(4);
    expect(
      screen.getByRole('link', { name: /See all 30 overdue tasks/ })
    ).toHaveAttribute('href', '/personal/tasks');
    expect(screen.getAllByText('3 days overdue')).toHaveLength(4);
  });

  it('renders Vietnamese copy', () => {
    renderIn('vi', <DayOverviewCards day={day} />);
    expect(screen.getByText('Lịch hôm nay')).toBeInTheDocument();
    expect(screen.getByText('Việc ưu tiên quá hạn')).toBeInTheDocument();
    expect(screen.getByText(/Xem tất cả 30 việc quá hạn/)).toBeInTheDocument();
  });

  it('shows the real tool time and sends follow-ups as prompts', () => {
    const onSend = vi.fn();
    renderIn(
      'en',
      <>
        <DayOverviewTrace durationMs={day.durationMs} />
        <DayOverviewFollowUps onSend={onSend} />
      </>
    );
    expect(
      screen.getByText('Checked calendar and tasks · 0.8s')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plan my day' }));
    expect(onSend).toHaveBeenCalledWith(
      "Plan my day around today's calendar and my overdue tasks."
    );
  });

  it('says when the calendar cannot be read instead of showing nothing', () => {
    const broken = parseDayOverview({
      success: true,
      date: '2026-11-16',
      calendar: null,
      errors: { calendar: 'denied' },
      tasks: { dueOnDay: [], overdue: [], counts: { dueOnDay: 0, overdue: 0 } },
    })!;
    renderIn('en', <DayOverviewCards day={broken} />);
    const schedule = screen.getByText("Today's schedule").closest('section')!;
    expect(
      within(schedule).getByText("I couldn't read your calendar for this day.")
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nothing due today and nothing overdue')
    ).toBeInTheDocument();
  });
});
