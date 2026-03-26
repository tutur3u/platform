import { describe, expect, it } from 'vitest';
import { normalizePostEmailQueueStatus } from '@/app/[locale]/(dashboard)/[wsId]/posts/status-derivation';

describe('normalizePostEmailQueueStatus', () => {
  it('does not treat pending approvals without a queue row as queued', () => {
    expect(
      normalizePostEmailQueueStatus({
        approvalStatus: 'PENDING',
        emailId: null,
        queueStatus: 'queued',
      })
    ).toBeUndefined();
  });

  it('preserves queued for approved deliveries that still have a real queue status', () => {
    expect(
      normalizePostEmailQueueStatus({
        approvalStatus: 'APPROVED',
        emailId: null,
        queueStatus: 'queued',
      })
    ).toBe('queued');
  });

  it('derives sent when the check already has a sent email id', () => {
    expect(
      normalizePostEmailQueueStatus({
        approvalStatus: 'APPROVED',
        emailId: 'email-1',
        queueStatus: null,
      })
    ).toBe('sent');
  });
});
