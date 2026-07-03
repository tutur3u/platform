import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  approveQrLoginChallenge,
  QrLoginApproveRequestSchema,
  toQrLoginErrorResult,
} from '@/lib/auth/qr-login';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/qr-login/challenges/[challengeId]/approve';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  return withRequestLogDrain({ request, route: ROUTE }, async () => {
    try {
      const { challengeId } = await params;
      const body = await request.json().catch(() => null);
      const parsed = QrLoginApproveRequestSchema.safeParse(body);

      if (!parsed.success || !challengeId) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        );
      }

      const result = await approveQrLoginChallenge(
        {
          ...parsed.data,
          challengeId,
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
