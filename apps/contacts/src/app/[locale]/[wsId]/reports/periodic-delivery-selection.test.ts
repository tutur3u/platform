import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { describe, expect, it } from 'vitest';
import { periodicDeliveryCategory } from './periodic-delivery-category';
import {
  canSelectPeriodicDelivery,
  samePeriodicRecipient,
} from './periodic-delivery-selection';

const report = {
  id: 'report-1',
  user_id: 'user-1',
  user_email: 'recipient@example.com',
  report_approval_status: 'APPROVED',
  generation_status: 'ready',
  delivery_status: 'draft',
  report_stage: 'approved',
  last_delivery_error: null,
} as PeriodicReport;

describe('current batch eligibility', () => {
  it('accepts a current approved ready unsent recipient', () =>
    expect(canSelectPeriodicDelivery(report)).toBe(true));
  it.each([
    'queued',
    'processing',
    'sent',
    'failed',
    'blocked',
    'skipped',
  ] as const)('never selects %s as a new send', (delivery_status) =>
    expect(canSelectPeriodicDelivery({ ...report, delivery_status })).toBe(
      false
    )
  );
  it('rejects missing email, approval, generation and recorded error', () => {
    expect(canSelectPeriodicDelivery({ ...report, user_email: ' ' })).toBe(
      false
    );
    expect(
      canSelectPeriodicDelivery({
        ...report,
        report_approval_status: 'PENDING',
      })
    ).toBe(false);
    expect(
      canSelectPeriodicDelivery({ ...report, generation_status: 'draft' })
    ).toBe(false);
    expect(
      canSelectPeriodicDelivery({
        ...report,
        last_delivery_error: 'Unknown delivery outcome',
      })
    ).toBe(false);
  });
  it('requires the reviewed subject and current recipient', () => {
    expect(
      samePeriodicRecipient(report, {
        ...report,
        user_email: ' Recipient@Example.com ',
      })
    ).toBe(true);
    expect(samePeriodicRecipient(report, { ...report, user_id: 'other' })).toBe(
      false
    );
    expect(
      samePeriodicRecipient(report, {
        ...report,
        user_email: 'other@example.com',
      })
    ).toBe(false);
    expect(
      samePeriodicRecipient(report, { ...report, delivery_status: 'queued' })
    ).toBe(false);
  });
});
describe('recorded blocker categories', () => {
  it.each([
    ['Recipient is unsubscribed or blocked.', 'suppression'],
    ['Subject profile email is missing.', 'missing_email'],
    ['Delivery gate blocked: sender_not_configured', 'infrastructure'],
    [
      'Email suppression lookup unavailable. Try again later.',
      'infrastructure',
    ],
    [
      'Email delivery outcome is unknown. Check provider logs before retrying.',
      'unknown',
    ],
    ['Email provider rejected the delivery.', 'failure'],
  ] as const)(
    'classifies %s without claiming live eligibility',
    (last_delivery_error, category) =>
      expect(
        periodicDeliveryCategory({
          ...report,
          delivery_status: 'blocked',
          last_delivery_error,
        })
      ).toBe(category)
  );
  it('preserves sent records despite a later missing profile email', () =>
    expect(
      periodicDeliveryCategory({
        ...report,
        delivery_status: 'sent',
        user_email: null,
      })
    ).toBeNull());
  it('does not label unblocked draft as failure', () =>
    expect(periodicDeliveryCategory(report)).toBeNull());
});
