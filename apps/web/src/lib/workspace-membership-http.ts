import type { WorkspaceMembershipCheckResult } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export const WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE =
  'Failed to verify workspace membership';

/**
 * Maps `verifyWorkspaceMembershipType` results to HTTP responses:
 * DB lookup failure → 500; missing/mismatched membership → 403 with `forbiddenBody`.
 */
export function membershipVerificationErrorResponse(
  result: WorkspaceMembershipCheckResult,
  forbiddenBody: Record<string, unknown>
): NextResponse | null {
  if (result.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: WORKSPACE_MEMBERSHIP_LOOKUP_FAILED_MESSAGE },
      { status: 500 }
    );
  }
  if (!result.ok) {
    return NextResponse.json(forbiddenBody, { status: 403 });
  }
  return null;
}
