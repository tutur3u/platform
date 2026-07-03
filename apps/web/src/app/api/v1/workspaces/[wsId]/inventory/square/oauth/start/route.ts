import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { squareOAuthStartQuerySchema } from '@tuturuuu/inventory-core/commerce/schemas';
import { createInventorySquareOAuthStart } from '@tuturuuu/inventory-core/commerce/square';
import { canManageInventorySetup } from '@tuturuuu/inventory-core/permissions';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { wsId: rawWsId } = await params;
    const authorization = await authorizeInventoryWorkspace(request, rawWsId);
    if (!authorization.ok) return authorization.response;

    if (!canManageInventorySetup(authorization.value.permissions)) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const parsed = squareOAuthStartQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams.entries())
    );
    const origin = new URL(request.url).origin;
    const response = await createInventorySquareOAuthStart({
      environment: parsed.environment,
      origin,
      returnTo: '/?square=connected',
      userId: authorization.value.userId,
      wsId: authorization.value.wsId,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid Square OAuth query', errors: error.issues },
        { status: 400 }
      );
    }

    serverLogger.error('Failed to start Square OAuth', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to start Square OAuth',
      },
      { status: 500 }
    );
  }
}
