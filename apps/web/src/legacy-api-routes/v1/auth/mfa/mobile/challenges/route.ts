import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  createMfaMobileApprovalChallenge,
  MfaMobileApprovalCreateRequestSchema,
  toMfaMobileApprovalErrorResult,
} from '@/lib/auth/mfa-mobile-approval';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/mfa/mobile/challenges';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, async () => {
    try {
      const body = await request.json().catch(() => ({}));
      const parsed = MfaMobileApprovalCreateRequestSchema.safeParse(body);

      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const result = await createMfaMobileApprovalChallenge(parsed.data, {
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
