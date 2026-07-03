import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';

type Params = {
  linkId: string;
  wsId: string;
};

const updateLinkSchema = z.object({
  status: z.enum(['active', 'revoked']),
});

export const PATCH = withSessionAuth<Params>(
  async (request, { supabase }, { linkId, wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const permissions = await getPermissions({
        request,
        wsId: normalizedWsId,
      });
      if (!permissions?.containsPermission('manage_users')) {
        return NextResponse.json({ message: 'Not found' }, { status: 404 });
      }

      const parsed = updateLinkSchema.safeParse(await request.json());
      if (!parsed.success) {
        return NextResponse.json(
          { message: 'Invalid parent link payload' },
          { status: 400 }
        );
      }

      const revokedAt =
        parsed.data.status === 'revoked' ? new Date().toISOString() : null;
      const { data, error } = await (await createAdminClient())
        .from('tulearn_parent_student_links')
        .update({
          status: parsed.data.status,
          revoked_at: revokedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', linkId)
        .eq('ws_id', normalizedWsId)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { message: 'Parent link not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ link: data });
    } catch (error) {
      serverLogger.error('Failed to update Tulearn parent link:', error);
      return NextResponse.json(
        { message: 'Failed to update parent link' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
