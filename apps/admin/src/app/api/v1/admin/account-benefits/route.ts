import { AccountBenefitGrant } from '@tuturuuu/utils/account-benefits';
import {
  AccountServiceError,
  accountPrivateRpc,
} from '@tuturuuu/utils/account-benefits-server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

const permissions = [
  'manage_workspace_roles',
  'manage_workspace_secrets',
] as const;
const headers = { 'Cache-Control': 'private, no-store' };
async function response(action: () => Promise<unknown>) {
  try {
    return NextResponse.json(await action(), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: 'Benefit request failed' },
      {
        status:
          error instanceof AccountServiceError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
        headers,
      }
    );
  }
}
async function body(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AccountServiceError(400);
  }
}
export async function GET(request: Request) {
  await connection();
  const auth = await authorizeInfrastructureAdminRequest([...permissions]);
  if (!auth.ok) return auth.response;
  return response(() =>
    accountPrivateRpc('list_account_benefits', {
      p_user_id: z
        .guid()
        .parse(new URL(request.url).searchParams.get('userId')),
    })
  );
}
export async function POST(request: Request) {
  const auth = await authorizeInfrastructureAdminRequest([...permissions]);
  if (!auth.ok) return auth.response;
  return response(async () =>
    accountPrivateRpc('grant_account_benefit', {
      p_actor_id: auth.user.id,
      p_grant: AccountBenefitGrant.parse(await body(request)),
    })
  );
}
export async function DELETE(request: Request) {
  const auth = await authorizeInfrastructureAdminRequest([...permissions]);
  if (!auth.ok) return auth.response;
  return response(async () =>
    accountPrivateRpc('revoke_account_benefit', {
      p_actor_id: auth.user.id,
      p_id: z
        .object({ id: z.guid() })
        .strict()
        .parse(await body(request)).id,
    })
  );
}
