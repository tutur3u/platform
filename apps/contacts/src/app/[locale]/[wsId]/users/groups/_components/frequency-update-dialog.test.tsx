// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkspaceUserGroupSession } from '@tuturuuu/internal-api';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrequencyUpdateDialog } from './frequency-update-dialog';

const listSessions = vi.fn();
const updateSession = vi.fn();

vi.mock('@tuturuuu/internal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api')>()),
  listWorkspaceUserGroupSessions: (...args: unknown[]) => listSessions(...args),
  updateWorkspaceUserGroupSession: (...args: unknown[]) =>
    updateSession(...args),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      cancel: 'Cancel',
      'days_of_week.friday': 'Friday',
      'days_of_week.monday': 'Monday',
      'days_of_week.saturday': 'Saturday',
      'days_of_week.sunday': 'Sunday',
      'days_of_week.thursday': 'Thursday',
      'days_of_week.tuesday': 'Tuesday',
      'days_of_week.wednesday': 'Wednesday',
      frequency_apply_changes: 'Apply {count} changes',
      frequency_review_changes: 'Review changes',
      frequency_update: 'Update frequency',
      group: 'Group',
    };
    return (labels[key] ?? key).replace('{count}', String(values?.count ?? ''));
  },
}));

function session(id: string, date: string): WorkspaceUserGroupSession {
  return {
    description: null,
    descriptionJson: null,
    endTimezone: 'Asia/Ho_Chi_Minh',
    endsAt: dayjs(`${date}T13:00:00.000Z`).toISOString(),
    files: [],
    groupId: '00000000-0000-4000-8000-000000000101',
    groupName: 'Math A1',
    id,
    recurrence: {
      daysOfWeek: [1, 3, 6],
      intervalWeeks: 1,
      startDate: '2026-08-17',
      untilDate: '2026-08-23',
    },
    recurrenceInstanceDate: date,
    seriesId: '00000000-0000-4000-8000-000000000201',
    source: 'admin',
    startTimezone: 'Asia/Ho_Chi_Minh',
    startsAt: dayjs(`${date}T12:00:00.000Z`).toISOString(),
    status: 'scheduled',
    tags: [],
    title: 'Math A1',
  };
}

function renderDialog(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('FrequencyUpdateDialog', () => {
  beforeEach(() => {
    listSessions.mockResolvedValue({
      data: [
        session('monday', '2026-08-17'),
        session('wednesday', '2026-08-19'),
        session('saturday', '2026-08-22'),
      ],
      groups: [],
      tags: [],
    });
    updateSession.mockResolvedValue({ data: [], message: 'success' });
  });

  it('shows the complete impact before applying a Saturday and Sunday schedule', async () => {
    renderDialog(
      <FrequencyUpdateDialog
        canChooseGroup={false}
        defaultGroupId="00000000-0000-4000-8000-000000000101"
        groups={[
          { id: '00000000-0000-4000-8000-000000000101', name: 'Math A1' },
        ]}
        wsId="00000000-0000-4000-8000-000000000001"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Update frequency' }));
    await screen.findByRole('checkbox', { name: 'Monday' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Monday' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wednesday' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sunday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(screen.getByText('frequency_removed_dates')).toBeInTheDocument();
    expect(screen.getByText('Mon, Aug 17, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Wed, Aug 19, 19:00')).toBeInTheDocument();
    expect(screen.getByText('Sun, Aug 23, 19:00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
    await waitFor(() =>
      expect(updateSession).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000001',
        'monday',
        {
          recurrence: {
            daysOfWeek: [0, 6],
            intervalWeeks: 1,
            untilDate: '2026-08-23',
          },
          scope: 'future',
        }
      )
    );
  });
});
