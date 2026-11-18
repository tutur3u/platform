import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FleetCard, type FleetCardLabels } from './fleet-card';

const labels: FleetCardLabels = {
  status: 'Trạng thái',
  owner: 'Người phụ trách',
  eta: 'Dự kiến',
  updated: 'Cập nhật',
  unowned: 'Chưa có người phụ trách',
  noEta: 'Chưa có hạn',
  noUpdate: 'Chưa cập nhật',
  overdue: 'Quá hạn',
  stale: 'Cũ',
  needsUser: 'Cần bạn',
  blockedBy: 'Bị chặn bởi',
  titleTooLong: 'Tiêu đề quá dài',
};

describe('FleetCard', () => {
  it('shows the four fixed fields and words for missing values instead of blanks', () => {
    render(
      <FleetCard
        eta={{ state: 'none' }}
        labels={labels}
        status="unknown"
        statusLabel="Chưa rõ"
        title="Calendar sync for shared rooms"
        updated={{ level: 'unknown' }}
      />
    );
    for (const text of [
      'Trạng thái',
      'Người phụ trách',
      'Dự kiến',
      'Cập nhật',
      'Chưa rõ',
      'Chưa có người phụ trách',
      'Chưa có hạn',
      'Chưa cập nhật',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it('puts the needs-you callout first and hides the blocker row behind it', () => {
    render(
      <FleetCard
        blockedBy="Stripe export"
        eta={{ state: 'due_soon', label: 'Today 15:00' }}
        labels={labels}
        needsUser
        needsUserReason="Production migration needs your OK"
        status="waiting_review"
        statusLabel="In review"
        title="Approve the Meet classroom limits migration"
        updated={{ level: 'fresh', label: '18m ago' }}
      />
    );
    expect(screen.getByRole('note').textContent).toContain(
      'Production migration needs your OK'
    );
    expect(screen.queryByText('Stripe export')).toBeNull();
    expect(
      screen
        .getByText('Today 15:00')
        .closest('[data-eta-state]')
        ?.getAttribute('data-eta-state')
    ).toBe('due_soon');
  });

  it('says overdue and stale in words, caps links at two plus a count, and opens on click', () => {
    const onOpen = vi.fn();
    render(
      <FleetCard
        blockedBy="Waiting for the billing export"
        eta={{ state: 'overdue', label: 'Yesterday' }}
        labels={labels}
        links={[
          {
            type: 'pr',
            label: '#7288',
            href: 'https://github.com/tutur3u/platform/pull/7288',
          },
          { type: 'commit', label: '3f9c2e1' },
          { type: 'thread', label: 'Rex' },
        ]}
        onOpen={onOpen}
        priority="normal"
        status="blocked"
        statusLabel="Blocked"
        title="Upskii credit ledger reconciliation"
        updated={{ level: 'stale', label: '2d' }}
      />
    );
    expect(screen.getByText('Quá hạn')).toBeTruthy();
    expect(screen.getByText('Cũ')).toBeTruthy();
    expect(screen.getByText('Bị chặn bởi')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.queryByText('Rex')).toBeNull();
    expect(screen.getByText('P2')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Upskii credit ledger reconciliation',
      })
    );
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
