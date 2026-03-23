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

import { assertWorkspaceApiKeysAccess } from '../shared';

const ApiKeyUpdateSchema = z
  .object({
    name: z.string().max(MAX_NAME_LENGTH).min(1).optional(),
    description: z.string().max(MAX_LONG_TEXT_LENGTH).min(1).optional(),
    role_id: z.guid().nullable().optional(),
    expires_at: z
      .string()
      .refine(
        (val) => {
          if (!val) return true; // null/empty is okay
          try {
            const date = new Date(val);
            return date.toISOString() === val;
          } catch {
            return false;
          }
        },
        { message: 'must be a valid ISO 8601 datetime' }
      )
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

interface RouteParams {
  wsId: string;
  keyId: string;
}

export const PUT = withSessionAuth<RouteParams>(
  async (req: NextRequest, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);
      const { keyId: id } = rawParams;

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const body = await req.json();
      const validation = ApiKeyUpdateSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { message: 'Invalid request', errors: validation.error.issues },
          { status: 400 }
        );
      }

      const data = validation.data;

      const sbAdmin = await createAdminClient();

      const { data: updatedKey, error } = await sbAdmin
        .from('workspace_api_keys')
        .update(data)
        .select('id')
        .eq('id', id)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (!error && !updatedKey) {
        return NextResponse.json(
          { message: 'API key not found' },
          { status: 404 }
        );
      }

      if (error) {
        console.error('Error updating API key:', error);
        return NextResponse.json(
          { message: 'Error updating workspace API key' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    } catch (error) {
      console.error('Error in PUT workspace API key:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);

export const DELETE = withSessionAuth<RouteParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const wsId = await normalizeWorkspaceId(rawParams.wsId, supabase);
      const { keyId: id } = rawParams;

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const sbAdmin = await createAdminClient();

      const { data: deletedKey, error } = await sbAdmin
        .from('workspace_api_keys')
        .delete()
        .select('id')
        .eq('id', id)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (!error && !deletedKey) {
        return NextResponse.json(
          { message: 'API key not found' },
          { status: 404 }
        );
      }

      if (error) {
        console.error('Error deleting workspace API key:', error);
        return NextResponse.json(
          { message: 'Error deleting workspace API key' },
          { status: 500 }
        );
      }

      return NextResponse.json({ message: 'success' });
    } catch (error) {
      console.error('Error in DELETE workspace API key:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
