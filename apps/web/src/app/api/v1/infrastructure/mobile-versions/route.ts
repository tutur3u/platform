import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMobileVersionPolicies,
  MOBILE_VERSION_POLICY_CONFIG_KEYS,
  normalizeMobileVersionPolicies,
  validateMobileVersionPolicies,
} from '@/lib/mobile-version-policy';

const PlatformPolicySchema = z.object({
  effectiveVersion: z.string().nullable().optional(),
  minimumVersion: z.string().nullable().optional(),
  storeUrl: z.string().nullable().optional(),
});

const UpdatePayloadSchema = z.object({
  ios: PlatformPolicySchema,
  android: PlatformPolicySchema,
});

async function authorizePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
  if (!permissions || permissions.withoutPermission('manage_workspace_roles')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

export async function GET() {
  const authorization = await authorizePlatformAdmin();
  if (!authorization.ok) {
    return authorization.response;
  }

  try {
    const policies = await getMobileVersionPolicies();
    return NextResponse.json(policies);
  } catch (error) {
    console.error('Failed to load mobile version policies:', error);
    return NextResponse.json(
      { message: 'Failed to load mobile version policies' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const authorization = await authorizePlatformAdmin();
  if (!authorization.ok) {
    return authorization.response;
  }

  const payload = UpdatePayloadSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: payload.error.issues },
      { status: 400 }
    );
  }

  const policies = normalizeMobileVersionPolicies(payload.data);
  const validation = validateMobileVersionPolicies(policies);
  if (!validation.valid) {
    return NextResponse.json(
      { message: 'Invalid mobile version policy', errors: validation.errors },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const rows = Object.entries(MOBILE_VERSION_POLICY_CONFIG_KEYS).flatMap(
    ([platform, keys]) => {
      const policy = policies[platform as keyof typeof policies];
      return [
        {
          id: keys.effectiveVersion,
          ws_id: ROOT_WORKSPACE_ID,
          value: policy.effectiveVersion ?? '',
          updated_at: new Date().toISOString(),
        },
        {
          id: keys.minimumVersion,
          ws_id: ROOT_WORKSPACE_ID,
          value: policy.minimumVersion ?? '',
          updated_at: new Date().toISOString(),
        },
        {
          id: keys.storeUrl,
          ws_id: ROOT_WORKSPACE_ID,
          value: policy.storeUrl ?? '',
          updated_at: new Date().toISOString(),
        },
      ];
    }
  );

  const { error } = await sbAdmin
    .from('workspace_configs')
    .upsert(rows, { onConflict: 'ws_id,id' });

  if (error) {
    console.error('Failed to save mobile version policies:', error);
    return NextResponse.json(
      { message: 'Failed to save mobile version policies' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success', data: policies });
}
