import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  MfaMobileApprovalPollQuerySchema,
  pollMfaMobileApprovalChallenge,
  toMfaMobileApprovalErrorResult,
} from '@/lib/auth/mfa-mobile-approval';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/mfa/mobile/challenges/[challengeId]';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  return withRequestLogDrain({ request, route: ROUTE }, async () => {
    try {
      const { challengeId } = await params;
      const parsed = MfaMobileApprovalPollQuerySchema.safeParse({
        secret: request.nextUrl.searchParams.get('secret') ?? undefined,
      });

      if (!parsed.success || !challengeId) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      const result = await pollMfaMobileApprovalChallenge(
        {
          challengeId,
          secret: parsed.data.secret,
        },
        {
          endpoint: ROUTE,
          headers: request.headers,
          request,
        }
      );

      const response = NextResponse.json(result.body, {
        status: result.status,
      });

      if ('cookie' in result && result.cookie) {
        response.cookies.set(result.cookie.name, result.cookie.value, {
          httpOnly: true,
          maxAge: result.cookie.maxAge,
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        });
      }

      return response;
    } catch (error) {
      const result = toMfaMobileApprovalErrorResult(error);
      return NextResponse.json(result.body, { status: result.status });
    }
  });
}
