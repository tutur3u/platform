import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLogInsights } from './audit-log-insights';

const replaceMock = vi.fn();
const translate = Object.assign((key: string) => key, {
  has: () => true,
});

vi.mock('next-intl', () => ({
  useTranslations: () => translate,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/ws-1/users/database',
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams('tab=audit-log'),
}));

describe('AuditLogInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders first-class status metrics for archive activity', async () => {
    render(
      <AuditLogInsights
        wsId="ws-1"
        locale="en"
        selectedPeriod="monthly"
        selectedValue="2026-03"
        timeOptions={[{ value: '2026-03', label: 'March 2026' }]}
        summary={{
          totalEvents: 18,
          archivedEvents: 7,
          reactivatedEvents: 5,
          archiveTimingEvents: 3,
          archiveRelatedEvents: 15,
          profileUpdates: 2,
          affectedUsersCount: 11,
          topActorName: 'Bob Example',
          topActorCount: 8,
          peakBucketLabel: 'Sat, Mar 7',
          peakBucketCount: 6,
        }}
        chartStats={[
          {
            key: '2026-03-07',
            label: '7',
            tooltipLabel: 'Sat, Mar 7',
            totalCount: 6,
            archivedCount: 3,
            reactivatedCount: 2,
            archiveTimingCount: 1,
            profileUpdateCount: 0,
          },
        ]}
        eventKind="all"
        source="all"
        affectedUserQuery=""
        actorQuery=""
        canExport={false}
        canRepairStatusHistory={false}
      />
    );

    expect(screen.getByText('total_events')).toBeInTheDocument();
    expect(screen.getAllByText('archived_actions')).toHaveLength(2);
    expect(screen.getAllByText('reactivated_actions')).toHaveLength(2);
    expect(screen.getAllByText('archive_timing_changes')).toHaveLength(2);
    expect(screen.getAllByText('profile_updates')).toHaveLength(2);
    expect(screen.getAllByText('users_affected')).toHaveLength(2);

    expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('11')).toHaveLength(2);
    expect(screen.getAllByText('archived_actions')).toHaveLength(2);
    expect(screen.getAllByText('reactivated_actions')).toHaveLength(2);
    expect(screen.getAllByText('archive_timing_changes')).toHaveLength(2);
    fireEvent.focus(screen.getByLabelText('Sat, Mar 7: 6'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Sat, Mar 7');
    expect(screen.getByRole('tooltip')).toHaveTextContent('total_events');
    expect(screen.getByRole('tooltip')).toHaveTextContent('archived_actions');
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'reactivated_actions'
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'archive_timing_changes'
    );
  });

  it('falls back to zero when older chart payloads omit per-status counts', async () => {
    render(
      <AuditLogInsights
        wsId="ws-1"
        locale="en"
        selectedPeriod="yearly"
        selectedValue="2026"
        timeOptions={[{ value: '2026', label: '2026' }]}
        summary={{
          totalEvents: 4,
          archivedEvents: 0,
          reactivatedEvents: 0,
          archiveTimingEvents: 0,
          archiveRelatedEvents: 0,
          profileUpdates: 0,
          affectedUsersCount: 4,
          topActorName: null,
          topActorCount: 0,
          peakBucketLabel: 'March 2026',
          peakBucketCount: 4,
        }}
        chartStats={[
          {
            key: '2026-03',
            label: 'Mar',
            tooltipLabel: 'March 2026',
            totalCount: 4,
          },
        ]}
        eventKind="all"
        source="all"
        affectedUserQuery=""
        actorQuery=""
        canExport={false}
        canRepairStatusHistory={false}
      />
    );

    fireEvent.focus(screen.getByLabelText('March 2026: 4'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    expect(screen.getByRole('tooltip')).toHaveTextContent('March 2026');
    expect(screen.getByRole('tooltip')).toHaveTextContent('archived_actions0');
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'reactivated_actions0'
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'archive_timing_changes0'
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('profile_updates0');
  });
});
