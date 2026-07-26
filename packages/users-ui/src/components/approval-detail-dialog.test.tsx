import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApprovalItem } from '../hooks/use-approvals';
import { ApprovalDetailSidebar } from './approval-detail-dialog-chrome';

const translations: Record<string, string> = {
  'detail.metadata': 'Metadata',
  'detail.statusHistory': 'Status history',
  'labels.approved_at': 'Approved',
  'labels.created_at': 'Created',
  'labels.creator': 'Creator',
  'labels.group': 'Group',
  'labels.last_modified_by': 'Last modified by',
  'labels.rejected_at': 'Rejected',
  'labels.rejection_reason': 'Reason',
  'labels.unknown_group': 'Unknown group',
  'labels.unknown_user': 'Unknown user',
  'labels.user': 'Recipient',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
}));

function reportItem(overrides: Record<string, unknown> = {}): ApprovalItem {
  return {
    approved_at: null,
    content: 'A detailed report',
    created_at: '2026-07-26T08:00:00.000Z',
    creator_id: 'creator-1',
    creator_name: 'Nguyễn Người Tạo Báo Cáo Với Tên Rất Dài',
    feedback: null,
    group_id: 'group-1',
    group_name: 'CS2-7S-18:00PM-ESI2-MR CHÍ ANH',
    id: 'report-1',
    kind: 'reports',
    modifier_name: 'Nguyễn Người Chỉnh Sửa Gần Nhất',
    rejection_reason: null,
    rejected_at: null,
    report_approval_status: 'PENDING',
    score: null,
    scores: null,
    title: 'Unit 8: A picnic',
    updated_by: 'modifier-1',
    user_id: 'recipient-1',
    user_name: 'Đào Quỳnh Lam',
    ...overrides,
  } as unknown as ApprovalItem;
}

describe('ApprovalDetailSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders report recipient, group, creator, and modifier metadata', () => {
    render(
      <ApprovalDetailSidebar
        formatDate={() => '26/07/2026 08:00'}
        item={reportItem()}
        wsId="workspace-1"
      />
    );

    expect(screen.getByText('Đào Quỳnh Lam')).toBeDefined();
    expect(screen.getByText('CS2-7S-18:00PM-ESI2-MR CHÍ ANH')).toBeDefined();
    expect(
      screen.getByText('Nguyễn Người Tạo Báo Cáo Với Tên Rất Dài')
    ).toBeDefined();
    expect(screen.getByText('Nguyễn Người Chỉnh Sửa Gần Nhất')).toBeDefined();
  });

  it('renders localized fallbacks instead of blank historical metadata', () => {
    render(
      <ApprovalDetailSidebar
        formatDate={() => '26/07/2026 08:00'}
        item={reportItem({
          creator_name: null,
          group_id: null,
          group_name: null,
          modifier_name: null,
          user_id: null,
          user_name: null,
        })}
        wsId="workspace-1"
      />
    );

    expect(screen.getByText('Unknown group')).toBeDefined();
    expect(screen.getAllByText('Unknown user')).toHaveLength(3);
  });
});
