import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isContactsFeatureSecretName,
  isContactsFeatureSecretValue,
} from '@tuturuuu/users-core/lib/contacts-feature-secrets';
import { getUserGroupRoutePermissions } from '@tuturuuu/users-core/lib/user-groups/route-auth';
import { resolveUserGroupRouteWorkspaceId } from '@tuturuuu/users-core/lib/user-groups/route-helpers';
import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ secretName: string; wsId: string }>;
}

const updateSchema = z.object({ value: z.string() });

/**
 * Flip one allowlisted module on/off switch that lives in `workspace_secrets`.
 *
 * The platform secrets endpoint authenticates through the Supabase cookie, so a
 * satellite app session resolves anonymous there and every write 401s. This is
 * deliberately not a general secrets route: it accepts only the names in
 * `CONTACTS_FEATURE_SECRET_NAMES` and only the values `true`/`false`, so it can
 * never read back or overwrite a credential.
 */
export async function PUT(request: Request, { params }: Params) {
  try {
    const { secretName, wsId: rawWsId } = await params;

    if (!isContactsFeatureSecretName(secretName)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const permissions = await getUserGroupRoutePermissions(rawWsId, request);
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (permissions.withoutPermission('manage_workspace_secrets')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update workspace secret' },
        { status: 403 }
      );
    }

    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success || !isContactsFeatureSecretValue(parsed.data.value)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const wsId = await resolveUserGroupRouteWorkspaceId(rawWsId, request);
    const admin = await createAdminClient({ noCookie: true });

    // `workspace_secrets` has no unique index on (ws_id, name), so an upsert
    // cannot name a conflict target. Update every matching row first — that
    // also repairs a workspace that already accumulated duplicates through the
    // platform's insert-only secrets endpoint — and insert only when the switch
    // has never been set.
    const updated = await admin
      .from('workspace_secrets')
      .update({ value: parsed.data.value })
      .eq('ws_id', wsId)
      .eq('name', secretName)
      .select('id');
    if (updated.error) throw updated.error;

    if ((updated.data?.length ?? 0) === 0) {
      const inserted = await admin.from('workspace_secrets').insert({
        name: secretName,
        value: parsed.data.value,
        ws_id: wsId,
      });
      if (inserted.error) throw inserted.error;
    }

    return NextResponse.json({ message: 'success' });
  } catch (error) {
    unstable_rethrow(error);
    console.error('Error updating Contacts feature secret', { error });
    return NextResponse.json(
      { error: 'Failed to update workspace secret' },
      { status: 500 }
    );
  }
}
