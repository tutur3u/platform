import {
  type APIRequestContext,
  type APIResponse,
  expect,
} from '@playwright/test';
import {
  LOCAL_E2E_SUPABASE_SECRET_KEY,
  LOCAL_E2E_SUPABASE_URL,
} from './environment';

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_E2E_SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? LOCAL_E2E_SUPABASE_SECRET_KEY;

export function serviceHeaders({
  prefer,
  schema,
}: {
  prefer?: string;
  schema?: 'private' | 'public';
} = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    'content-type': 'application/json',
    ...(prefer ? { prefer } : {}),
    ...(schema
      ? {
          'accept-profile': schema,
          'content-profile': schema,
        }
      : {}),
  };
}

export async function expectStatus(response: APIResponse, status: number) {
  expect(response.status()).toBe(status);
}

export async function postRestRow({
  data,
  request,
  schema,
  table,
}: {
  data: unknown;
  request: APIRequestContext;
  schema?: 'private' | 'public';
  table: string;
}) {
  const response = await request.post(`${SUPABASE_URL}/rest/v1/${table}`, {
    data,
    failOnStatusCode: false,
    headers: serviceHeaders({ prefer: 'return=minimal', schema }),
  });

  if (response.status() !== 201) {
    throw new Error(
      `Expected ${schema ?? 'public'}.${table} insert to return 201, got ${response.status()}: ${await response.text()}`
    );
  }
}

export async function deleteRestRows({
  filter,
  request,
  schema,
  table,
}: {
  filter: string;
  request: APIRequestContext;
  schema?: 'private' | 'public';
  table: string;
}) {
  await request.delete(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    failOnStatusCode: false,
    headers: serviceHeaders({ prefer: 'return=minimal', schema }),
  });
}
