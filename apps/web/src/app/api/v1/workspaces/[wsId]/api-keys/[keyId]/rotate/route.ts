import { generateApiKey, hashApiKey } from '@tuturuuu/auth/api-keys';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

import { assertWorkspaceApiKeysAccess } from '../../shared';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  keyId: z.guid(),
});

interface RouteParams {
  wsId: string;
  keyId: string;
}

export const POST = withSessionAuth<RouteParams>(
  async (_req, { user, supabase }, rawParams) => {
    try {
      const paramValidation = paramsSchema.safeParse(rawParams);
      if (!paramValidation.success) {
        return NextResponse.json(
          { message: 'Invalid workspace ID or key ID' },
          { status: 400 }
        );
      }

      const { wsId: rawWsId, keyId: validatedKeyId } = paramValidation.data;
      const wsId = await normalizeWorkspaceId(rawWsId, supabase);

      const denied = await assertWorkspaceApiKeysAccess(
        supabase,
        user.id,
        wsId
      );
      if (denied) return denied;

      const sbAdmin = await createAdminClient();

      const { data: existingKey, error: fetchError } = await sbAdmin
        .from('workspace_api_keys')
        .select('id')
        .eq('id', validatedKeyId)
        .eq('ws_id', wsId)
        .maybeSingle();

      if (fetchError || !existingKey) {
        console.error('Error fetching API key for rotation:', fetchError);
        return NextResponse.json(
          { message: 'API key not found' },
          { status: 404 }
        );
      }

      const { key, prefix } = generateApiKey();
      const keyHash = await hashApiKey(key);

      const { error: updateError } = await sbAdmin
        .from('workspace_api_keys')
        .update({
          key_hash: keyHash,
          key_prefix: prefix,
          last_used_at: null,
        })
        .eq('id', validatedKeyId)
        .eq('ws_id', wsId);

      if (updateError) {
        console.error('Error rotating API key:', updateError);
        return NextResponse.json(
          { message: 'Error rotating API key' },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          message: 'API key rotated successfully',
          key,
          prefix,
        },
        {
          headers: {
            'Cache-Control':
              'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    } catch (error) {
      console.error('Error in POST rotate API key:', error);
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }
);
