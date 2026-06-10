import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeMobileDeploymentAdmin,
  validateJsonMutation,
} from '@/lib/mobile-deployment/access';
import {
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
  type MobileDeploymentScalarName,
} from '@/lib/mobile-deployment/constants';
import {
  listMobileDeploymentState,
  MobileDeploymentStoreError,
  saveMobileDeploymentEnvFile,
  saveMobileDeploymentScalar,
} from '@/lib/mobile-deployment/store';
import { assertMobileDeploymentScalarName } from '@/lib/mobile-deployment/validation';

export const runtime = 'nodejs';

const SavePayloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('replace_env'),
    envFile: z.string().max(512 * 1024),
  }),
  z.object({
    action: z.literal('save_scalar'),
    name: z.enum(MOBILE_DEPLOYMENT_SCALAR_NAMES),
    value: z.string().max(32 * 1024),
  }),
]);

function errorResponse(error: unknown) {
  if (error instanceof MobileDeploymentStoreError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    { message: 'Failed to update mobile deployment vault' },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await listMobileDeploymentState(access.db));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const mutationError = validateJsonMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = SavePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.action === 'replace_env') {
      return NextResponse.json(
        await saveMobileDeploymentEnvFile({
          contents: parsed.data.envFile,
          db: access.db,
          userId: access.userId,
        })
      );
    }

    return NextResponse.json(
      await saveMobileDeploymentScalar({
        db: access.db,
        name: assertMobileDeploymentScalarName(
          parsed.data.name
        ) as MobileDeploymentScalarName,
        userId: access.userId,
        value: parsed.data.value,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
