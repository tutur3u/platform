import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { findOpenParentLinks, PG_UNIQUE_VIOLATION } from '@/lib/parent-links';

type Params = {
  linkId: string;
  wsId: string;
};

// `active` is kept for older callers; it requests reactivation, which now
// always returns to `pending` until the parent accepts again.
const updateLinkSchema = z.object({
  status: z.enum(['active', 'pending', 'revoked']),
});

export const PATCH = withSessionAuth<Params>(
  async (request, { supabase, user }, { linkId, wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const permissions = await getPermissions({
        user,
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

      const sbAdmin = await createAdminClient();
      const { data: current, error: currentError } = await sbAdmin
        .from('tulearn_parent_student_links')
        .select('*')
        .eq('id', linkId)
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

      if (currentError) throw currentError;
      if (!current) {
        return NextResponse.json(
          { message: 'Parent link not found' },
          { status: 404 }
        );
      }

      const now = new Date().toISOString();

      if (parsed.data.status === 'revoked') {
        if (current.status === 'revoked') {
          return NextResponse.json({ link: current });
        }

        const { data, error } = await sbAdmin
          .from('tulearn_parent_student_links')
          .update({ revoked_at: now, status: 'revoked', updated_at: now })
          .eq('id', linkId)
          .eq('ws_id', normalizedWsId)
          .select()
          .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ link: data ?? current });
      }

      // Re-consent: an admin can reopen a revoked link but only the parent can
      // make it active again. Pending/active links are left untouched.
      if (current.status !== 'revoked') {
        return NextResponse.json({ link: current });
      }

      const { active, pending } = await findOpenParentLinks(sbAdmin, {
        parentUserId: current.parent_user_id,
        studentWorkspaceUserId: current.student_workspace_user_id,
        wsId: normalizedWsId,
      });
      if (active || pending) {
        return NextResponse.json(
          { message: 'A pending or active parent link already exists' },
          { status: 409 }
        );
      }

      const { data, error } = await sbAdmin
        .from('tulearn_parent_student_links')
        .update({
          accepted_at: null,
          revoked_at: null,
          status: 'pending',
          updated_at: now,
        })
        .eq('id', linkId)
        .eq('ws_id', normalizedWsId)
        .eq('status', 'revoked')
        .select()
        .maybeSingle();

      if (error && error.code !== PG_UNIQUE_VIOLATION) throw error;
      if (!data) {
        return NextResponse.json(
          { message: 'Parent link is no longer revoked' },
          { status: 409 }
        );
      }

      return NextResponse.json({ link: data });
    } catch (error) {
      console.error('Failed to update Tulearn parent link:', error);
      return NextResponse.json(
        { message: 'Failed to update parent link' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
