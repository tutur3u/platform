import { describe, expect, it } from 'vitest';
import {
  DELIVERY_CATEGORIES,
  isHeldPeriodicReport,
  periodicDeliveryCategory,
} from './report-delivery-category';
import { summarizeReportList } from './report-list-query';

// Synthetic fixtures only.
const held = {
  delivery_status: 'draft',
  delivered_at: null,
  generation_status: 'ready',
  last_delivery_error: null,
  report_approval_status: 'APPROVED',
  report_stage: 'approved',
  user_email: 'learner@example.com',
};

describe('held (approved, never sent) classification', () => {
  it('lists held as a delivery category', () => {
    expect(DELIVERY_CATEGORIES).toContain('held');
  });

  it('classifies an approved report with no requested delivery as held', () => {
    expect(isHeldPeriodicReport(held)).toBe(true);
    expect(periodicDeliveryCategory(held)).toBe('held');
  });

  it.each([
    ['queued', { delivery_status: 'queued', report_stage: 'queued' }],
    [
      'processing',
      { delivery_status: 'processing', report_stage: 'processing' },
    ],
    ['sent', { delivery_status: 'sent', report_stage: 'sent' }],
    ['failed', { delivery_status: 'failed', report_stage: 'failed' }],
    ['blocked', { delivery_status: 'blocked', report_stage: 'blocked' }],
    ['skipped', { delivery_status: 'skipped', report_stage: 'skipped' }],
    ['cancelled', { delivery_status: 'cancelled', report_stage: 'skipped' }],
    [
      'pending approval',
      { report_approval_status: 'PENDING', report_stage: 'pending' },
    ],
    [
      'rejected',
      { report_approval_status: 'REJECTED', report_stage: 'rejected' },
    ],
    ['still a draft', { generation_status: 'draft', report_stage: 'draft' }],
    ['already delivered', { delivered_at: '2026-10-01T00:00:00Z' }],
  ])('does not hold a report that is %s', (_label, change) => {
    expect(isHeldPeriodicReport({ ...held, ...change })).toBe(false);
    expect(periodicDeliveryCategory({ ...held, ...change })).not.toBe('held');
  });

  it('keeps recorded blockers ahead of held', () => {
    expect(periodicDeliveryCategory({ ...held, user_email: ' ' })).toBe(
      'missing_email'
    );
    expect(
      periodicDeliveryCategory({
        ...held,
        last_delivery_error: 'Delivery gate blocked',
      })
    ).toBe('infrastructure');
  });

  it('falls back to the raw fields when the stage is unavailable', () => {
    expect(isHeldPeriodicReport({ ...held, report_stage: undefined })).toBe(
      true
    );
    expect(
      isHeldPeriodicReport({
        ...held,
        report_stage: undefined,
        generation_status: 'generating',
      })
    ).toBe(false);
  });

  it('counts held reports in the worklist summary', () => {
    const { categoryCounts, counts } = summarizeReportList([
      held,
      held,
      { ...held, delivery_status: 'queued', report_stage: 'queued' },
    ]);
    expect(categoryCounts.held).toBe(2);
    expect(counts.approved).toBe(2);
  });
});
