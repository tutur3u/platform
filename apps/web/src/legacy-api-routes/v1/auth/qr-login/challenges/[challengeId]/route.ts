import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  pollQrLoginChallenge,
  QrLoginPollQuerySchema,
  toQrLoginErrorResult,
} from '@/lib/auth/qr-login';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/qr-login/challenges/[challengeId]';

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
      const parsed = QrLoginPollQuerySchema.safeParse({
        secret: request.nextUrl.searchParams.get('secret') ?? undefined,
      });

      if (!parsed.success || !challengeId) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      const result = await pollQrLoginChallenge(
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

      return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
      const result = toQrLoginErrorResult(error);
      return NextResponse.json(result.body, { status: result.status });
    }
  });
}
