import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  listPendingMfaMobileApprovals,
  toMfaMobileApprovalErrorResult,
} from '@/lib/auth/mfa-mobile-approval';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/mfa/mobile/approvals';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, async () => {
    try {
      const result = await listPendingMfaMobileApprovals({
        endpoint: ROUTE,
        headers: request.headers,
        request,
      });

      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      const result = toMfaMobileApprovalErrorResult(error);
      return NextResponse.json(result.body, { status: result.status });
    }
  });
}
