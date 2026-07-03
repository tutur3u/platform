import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { mintAiTempAuthToken } from '@tuturuuu/utils/ai-temp-auth';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

type TempAuthBody = {
  wsId?: string;
  creditWsId?: string;
  creditSource?: 'personal' | 'workspace';
};

function isCreditSource(value: unknown): value is 'personal' | 'workspace' {
  return value === 'personal' || value === 'workspace';
}

async function parseBody(request: Request): Promise<TempAuthBody> {
  try {
    const body = (await request.json()) as TempAuthBody;
    return {
      wsId: typeof body.wsId === 'string' ? body.wsId : undefined,
      creditWsId:
        typeof body.creditWsId === 'string' ? body.creditWsId : undefined,
      creditSource: isCreditSource(body.creditSource)
        ? body.creditSource
        : undefined,
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    wsId,
    creditWsId,
    creditSource = 'workspace',
  } = await parseBody(request);
  let normalizedWsId: string | undefined;
  let normalizedCreditWsId: string | undefined;

  try {
    normalizedWsId = wsId
      ? await normalizeWorkspaceId(
          wsId,
          supabase,
          request as unknown as NextRequest
        )
      : undefined;
    normalizedCreditWsId = creditWsId
      ? await normalizeWorkspaceId(
          creditWsId,
          supabase,
          request as unknown as NextRequest
        )
      : undefined;
  } catch {
    return NextResponse.json(
      { error: 'Invalid workspace identifier' },
      { status: 422 }
    );
  }

  if (normalizedWsId) {
    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }
  }

  let tokenCreditWsId = normalizedCreditWsId;
  if (creditSource === 'personal') {
    const sbAdmin = await createAdminClient();
    const { data: personalWorkspace, error: personalWorkspaceError } =
      await sbAdmin
        .from('workspaces')
        .select('id, workspace_members!inner(user_id)')
        .eq('personal', true)
        .eq('workspace_members.user_id', user.id)
        .maybeSingle();

    if (personalWorkspaceError) {
      return NextResponse.json(
        { error: 'Failed to resolve personal workspace' },
        { status: 500 }
      );
    }

    if (!personalWorkspace?.id) {
      return NextResponse.json(
        { error: 'Personal workspace not found' },
        { status: 403 }
      );
    }

    if (normalizedCreditWsId && normalizedCreditWsId !== personalWorkspace.id) {
      return NextResponse.json(
        { error: 'Invalid credit workspace' },
        { status: 403 }
      );
    }

    tokenCreditWsId = personalWorkspace.id;
  } else if (normalizedCreditWsId) {
    if (normalizedWsId && normalizedCreditWsId !== normalizedWsId) {
      return NextResponse.json(
        { error: 'Invalid credit workspace' },
        { status: 403 }
      );
    }

    if (!normalizedWsId) {
      const billingMembership = await verifyWorkspaceMembershipType({
        wsId: normalizedCreditWsId,
        userId: user.id,
        supabase,
      });

      if (billingMembership.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify credit workspace membership' },
          { status: 500 }
        );
      }

      if (!billingMembership.ok) {
        return NextResponse.json(
          { error: 'Workspace access denied' },
          { status: 403 }
        );
      }
    }
  }

  const minted = await mintAiTempAuthToken({
    user: { id: user.id, email: user.email ?? null },
    ...(normalizedWsId ? { wsId: normalizedWsId } : {}),
    ...(tokenCreditWsId ? { creditWsId: tokenCreditWsId } : {}),
    creditSource,
  });

  return NextResponse.json({
    token: minted?.token ?? null,
    expiresAt: minted?.expiresAt ?? null,
    ttlSeconds: 60,
  });
}
