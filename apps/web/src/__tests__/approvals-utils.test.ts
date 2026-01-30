import { describe, expect, it } from 'vitest';
import { getStatusColorClasses } from '@/app/[locale]/(dashboard)/[wsId]/users/approvals/utils';

describe('approvals utils', () => {
  it('maps pending status to dynamic orange token', () => {
    expect(getStatusColorClasses('PENDING')).toContain('dynamic-orange');
  });

  it('maps approved status to dynamic green token', () => {
    expect(getStatusColorClasses('APPROVED')).toContain('dynamic-green');
  });

  it('maps rejected status to dynamic red token', () => {
    expect(getStatusColorClasses('REJECTED')).toContain('dynamic-red');
  });
});
