import { connection, type NextRequest, NextResponse } from 'next/server';
import { DeviceMfaError } from '@/lib/auth/device-mfa/registry';
import {
  deviceMfaRequest,
  deviceRequestSchema,
} from '@/lib/auth/device-mfa/service';

async function handle(request: NextRequest, mutation: boolean) {
  await connection();
  try {
    const input = mutation
      ? deviceRequestSchema.safeParse(await request.json().catch(() => null))
      : undefined;
    if (input && !input.success)
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const result = await deviceMfaRequest(request, input?.data);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof DeviceMfaError
            ? error.message
            : 'Authenticator settings unavailable',
      },
      {
        status: error instanceof DeviceMfaError ? error.status : 500,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);
