import { describe, expect, it } from 'vitest';
import {
  type ApprovalStatus,
  getStatusColorClasses,
} from '@/app/[locale]/(dashboard)/[wsId]/users/approvals/utils';

describe('approvals utils', () => {
  it.each([
    { status: 'PENDING' as const, expected: 'dynamic-orange' },
    { status: 'APPROVED' as const, expected: 'dynamic-green' },
    { status: 'REJECTED' as const, expected: 'dynamic-red' },
    { status: undefined, expected: '' },
    { status: null, expected: '' },
    { status: 'UNKNOWN' as string, expected: '' },
  ])('maps status "$status" to expected color token', ({
    status,
    expected,
  }) => {
    const result = getStatusColorClasses(
      status as ApprovalStatus | undefined | null
    );
    if (expected === '') {
      expect(result).toBe('');
    } else {
      expect(result).toContain(expected);
    }
  });
});
