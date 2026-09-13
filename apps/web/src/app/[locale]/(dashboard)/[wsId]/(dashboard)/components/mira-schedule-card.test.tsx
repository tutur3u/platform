import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { MiraScheduleCard } from './mira-schedule-card';

describe('schedule card timezone', () => {
  it('uses the artifact timezone for both event times and the meeting date badge', () => {
    render(
      <NextIntlClientProvider
        locale="en"
        timeZone="UTC"
        messages={{ dashboard: { mira_workspace: { meetings: 'Meetings' } } }}
      >
        <MiraScheduleCard
          meetings
          timeZone="Asia/Ho_Chi_Minh"
          row={{
            id: 'boundary',
            title: 'Local midnight meeting',
            date: '2026-09-30T17:00:00Z',
            endDate: '2026-09-30T17:45:00Z',
          }}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText('Oct')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('12:00 AM')).toBeInTheDocument();
    expect(screen.getByText('12:45 AM')).toBeInTheDocument();
    expect(screen.queryByText('05:00 PM')).not.toBeInTheDocument();
  });
});
