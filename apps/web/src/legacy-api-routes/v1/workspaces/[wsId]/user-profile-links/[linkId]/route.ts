import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PROFILE_LINK_FIELDS } from '@/features/user-profile-links/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ wsId: string; linkId: string }>;
}

const patchSchema = z
  .object({
    revoked: z.boolean().optional(),
    expires_at: z.string().datetime({ offset: true }).nullable().optional(),
    max_uses: z.number().int().positive().nullable().optional(),
    allowed_fields: z
      .array(z.enum(PROFILE_LINK_FIELDS))
      .min(1)
      .refine((fields) => new Set(fields).size === fields.length)
      .optional(),
    prefill_existing_values: z.boolean().optional(),
    requires_auth: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'No fields to update',
  });

async function requirePermission(req: Request, wsId: string) {
  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!permissions.containsPermission('manage_user_profile_links')) {
    return NextResponse.json(
      { message: 'Insufficient permissions to manage profile links' },
      { status: 403 }
    );
  }
  return null;
}

export async function PATCH(req: Request, { params }: Params) {
  const { wsId, linkId } = await params;

  const denied = await requirePermission(req, wsId);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const update: {
    revoked_at?: string | null;
    expires_at?: string | null;
    max_uses?: number | null;
    allowed_fields?: string[];
    prefill_existing_values?: boolean;
    requires_auth?: boolean;
  } = {};
  if (parsed.data.revoked !== undefined) {
    update.revoked_at = parsed.data.revoked ? new Date().toISOString() : null;
  }
  if (parsed.data.expires_at !== undefined) {
    update.expires_at = parsed.data.expires_at;
  }
  if (parsed.data.max_uses !== undefined) {
    update.max_uses = parsed.data.max_uses;
  }
  if (parsed.data.allowed_fields !== undefined) {
    update.allowed_fields = parsed.data.allowed_fields;
  }
  if (parsed.data.prefill_existing_values !== undefined) {
    update.prefill_existing_values = parsed.data.prefill_existing_values;
  }
  if (parsed.data.requires_auth !== undefined) {
    update.requires_auth = parsed.data.requires_auth;
  }

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_user_profile_links')
    .update(update as never)
    .eq('ws_id', wsId)
    .eq('id', linkId);

  if (error) {
    serverLogger.error('Error updating profile link:', error);
    return NextResponse.json(
      { message: 'Error updating profile link' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, linkId } = await params;

  const denied = await requirePermission(req, wsId);
  if (denied) return denied;

  const sbAdmin = await createAdminClient();
  const { error } = await sbAdmin
    .from('workspace_user_profile_links')
    .delete()
    .eq('ws_id', wsId)
    .eq('id', linkId);

  if (error) {
    serverLogger.error('Error deleting profile link:', error);
    return NextResponse.json(
      { message: 'Error deleting profile link' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
