import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export type DevboxStorageErrorLike = { message?: string } | null;

export type DevboxPrivateSchemaClient = {
  from: (table: string) => unknown;
  rpc: <T = unknown>(
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: T | null; error: DevboxStorageErrorLike }>;
};

const DEVBOX_READINESS_MESSAGE =
  "Remote devboxes are not ready: Supabase is missing private devbox tables or PostgREST schema cache has not refreshed. Apply migration 20260603171600_create_private_devboxes.sql, then run notify pgrst, 'reload schema' if the table already exists.";

export class DevboxStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = 'DevboxStoreError';
  }
}

export async function createPrivateDevboxClient() {
  const admin = await createAdminClient({ noCookie: true });
  return (
    admin as unknown as {
      schema: (schema: string) => DevboxPrivateSchemaClient;
    }
  ).schema('private');
}

function isDevboxReadinessError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('devbox_') &&
    (normalized.includes('schema cache') ||
      normalized.includes('could not find the table') ||
      normalized.includes('could not find the function') ||
      normalized.includes('does not exist'))
  );
}

export function getDevboxStorageError(error: DevboxStorageErrorLike) {
  const message = error?.message ?? 'Unknown devbox storage error';
  if (isDevboxReadinessError(message)) {
    return new DevboxStoreError(DEVBOX_READINESS_MESSAGE, 503);
  }

  return new DevboxStoreError(message);
}

export function createDevboxRouteErrorResponse(
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof DevboxStoreError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      message: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 }
  );
}
