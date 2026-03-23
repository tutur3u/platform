import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

import { assertWorkspaceApiKeysAccess } from './shared';

const ApiKeyCreateSchema = z.object({
  name: z.string().max(MAX_NAME_LENGTH).min(1),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  role_id: z.string().max(MAX_LONG_TEXT_LENGTH).nullable(),
  expires_at: z
    .string()
    .refine(
      (val) => {
        if (!val) return true;
        try {
          const date = new Date(val);
          return date.toISOString() === val;
        } catch {
          return false;
        }
      },
      { message: 'expires_at must be a valid ISO 8601 datetime' }
    )
    .nullable(),
});

const SAFE_COLUMNS =
  'id, ws_id, name, description, key_prefix, role_id, last_used_at, expires_at, created_at, updated_at, created_by';

interface RouteParams {
  wsId: string;
}

export const GET = withSessionAuth<RouteParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const sbAdmin = await createAdminClient();

      const { data, error } = await sbAdmin
        .from('workspace_api_keys')
        .select(SAFE_COLUMNS)
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        return NextResponse.json(
          { message: 'Error fetching workspace API configs' },
          { status: 500 }
        );
      }

      return NextResponse.json(data ?? []);
    } catch (error) {
      console.error('Error in GET workspace API keys:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const POST = withSessionAuth<RouteParams>(
  async (req: NextRequest, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const body = await req.json();
      const validation = ApiKeyCreateSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Invalid request', errors: validation.error.issues },
          { status: 400 }
        );
      }

      const data = validation.data;

      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);

      const sbAdmin = await createAdminClient();

      const { error } = await sbAdmin.from('workspace_api_keys').insert({
        ws_id: wsId,
        name: data.name,
        description: data.description,
        role_id: data.role_id,
        expires_at: data.expires_at,
        key_hash: keyHash,
        key_prefix: prefix,
        created_by: user.id,
      });

      if (error) {
        console.error('Error creating API key:', error);
        return NextResponse.json(
          { message: 'Error creating workspace API key' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'API key created successfully',
        key,
        prefix,
      });
    } catch (error) {
      console.error('Error in POST workspace API keys:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
