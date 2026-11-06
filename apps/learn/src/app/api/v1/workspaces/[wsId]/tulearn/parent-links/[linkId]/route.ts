import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { revokePendingParentInvites } from '@/lib/parent-invites';
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
        let revoked = current;
        if (current.status !== 'revoked') {
          const { data, error } = await sbAdmin
            .from('tulearn_parent_student_links')
            .update({ revoked_at: now, status: 'revoked', updated_at: now })
            .eq('id', linkId)
            .eq('ws_id', normalizedWsId)
            .select()
            .maybeSingle();

          if (error) throw error;
          revoked = data ?? current;
        }

        // An emailed invite still in flight would otherwise let the parent
        // restore the access that was just revoked.
        const { data: parent, error: parentError } =
          await sbAdmin.auth.admin.getUserById(current.parent_user_id);
        if (parentError) throw parentError;
        const invitesRevoked = parent.user?.email
          ? await revokePendingParentInvites(sbAdmin, {
              parentEmail: parent.user.email,
              studentWorkspaceUserId: current.student_workspace_user_id,
              wsId: normalizedWsId,
            })
          : true;
        if (!invitesRevoked) {
          // The link is revoked, but a pending invite could still restore it.
          // Revoking again is idempotent, so the caller can simply retry.
          return NextResponse.json(
            {
              link: revoked,
              message:
                'Link revoked, but pending invites could not be revoked; retry',
            },
            { status: 500 }
          );
        }

        return NextResponse.json({ link: revoked });
      }

      // Re-consent: an admin can reopen a revoked link but only the parent can
      // make it active again. Pending/active links are left untouched. The
      // accepted_at/revoked_at history is kept so a replayed invite token can
      // still tell its acceptance was already carried out.
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
        .update({ status: 'pending', updated_at: now })
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
