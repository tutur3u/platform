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
  clearMobileDeploymentEnvKey,
  clearMobileDeploymentScalar,
  listMobileDeploymentState,
  MobileDeploymentStoreError,
  saveMobileDeploymentEnvFile,
  saveMobileDeploymentEnvKey,
  saveMobileDeploymentScalar,
} from '@/lib/mobile-deployment/store';
import {
  assertMobileDeploymentScalarName,
  MobileDeploymentValidationError,
} from '@/lib/mobile-deployment/validation';

const SavePayloadSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('replace_env'),
    envFile: z.string().max(512 * 1024),
  }),
  z.object({
    action: z.literal('save_env_key'),
    name: z.string().max(80),
    previousName: z.string().max(80).optional(),
    value: z.string().max(16 * 1024),
  }),
  z.object({
    action: z.literal('clear_env_key'),
    name: z.string().max(80),
  }),
  z.object({
    action: z.literal('save_scalar'),
    name: z.enum(MOBILE_DEPLOYMENT_SCALAR_NAMES),
    value: z.string().max(32 * 1024),
  }),
  z.object({
    action: z.literal('clear_scalar'),
    name: z.enum(MOBILE_DEPLOYMENT_SCALAR_NAMES),
  }),
  z.object({
    action: z.literal('save_secret'),
    kind: z.enum(['env', 'scalar']),
    name: z.string().max(80),
    previousName: z.string().max(80).optional(),
    value: z.string().max(32 * 1024),
  }),
  z.object({
    action: z.literal('clear_secret'),
    kind: z.enum(['env', 'scalar']),
    name: z.string().max(80),
  }),
]);

function errorResponse(error: unknown) {
  if (error instanceof MobileDeploymentValidationError) {
    return NextResponse.json(
      {
        code: 'mobile_deployment_validation_error',
        errors: error.errors,
        message: error.message,
      },
      { status: 400 }
    );
  }

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

    if (parsed.data.action === 'save_env_key') {
      return NextResponse.json(
        await saveMobileDeploymentEnvKey({
          db: access.db,
          name: parsed.data.name,
          previousName: parsed.data.previousName,
          userId: access.userId,
          value: parsed.data.value,
        })
      );
    }

    if (parsed.data.action === 'clear_env_key') {
      return NextResponse.json(
        await clearMobileDeploymentEnvKey({
          db: access.db,
          name: parsed.data.name,
          userId: access.userId,
        })
      );
    }

    if (parsed.data.action === 'save_scalar') {
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
    }

    if (parsed.data.action === 'save_secret') {
      if (parsed.data.kind === 'env') {
        return NextResponse.json(
          await saveMobileDeploymentEnvKey({
            db: access.db,
            name: parsed.data.name,
            previousName: parsed.data.previousName,
            userId: access.userId,
            value: parsed.data.value,
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
    }

    if (parsed.data.action === 'clear_secret') {
      if (parsed.data.kind === 'env') {
        return NextResponse.json(
          await clearMobileDeploymentEnvKey({
            db: access.db,
            name: parsed.data.name,
            userId: access.userId,
          })
        );
      }

      return NextResponse.json(
        await clearMobileDeploymentScalar({
          db: access.db,
          name: assertMobileDeploymentScalarName(
            parsed.data.name
          ) as MobileDeploymentScalarName,
          userId: access.userId,
        })
      );
    }

    return NextResponse.json(
      await clearMobileDeploymentScalar({
        db: access.db,
        name: assertMobileDeploymentScalarName(
          parsed.data.name
        ) as MobileDeploymentScalarName,
        userId: access.userId,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
