import { hasEducationEnabled } from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { createAndSendParentInvite } from '@/lib/parent-invites';
import { findOpenParentLinks } from '@/lib/parent-links';

type Params = {
  wsId: string;
};

const parentLinkSchema = z.object({
  parentUserId: z.string().uuid().optional(),
  parentEmail: z.string().email().optional(),
  studentPlatformUserId: z.string().uuid(),
  studentWorkspaceUserId: z.string().uuid(),
});

export const GET = withSessionAuth<Params>(
  async (_request, { supabase, user }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const permissions = await getPermissions({
        user,
        wsId: normalizedWsId,
      });
      if (!permissions?.containsPermission('manage_users')) {
        return NextResponse.json({ message: 'Not found' }, { status: 404 });
      }

      const sbAdmin = await createAdminClient();
      if (!(await hasEducationEnabled(normalizedWsId, sbAdmin))) {
        return NextResponse.json(
          { message: 'Tulearn is not enabled for this workspace' },
          { status: 404 }
        );
      }

      const { data, error } = await sbAdmin
        .from('tulearn_parent_student_links')
        .select(
          'id, ws_id, parent_user_id, student_platform_user_id, student_workspace_user_id, status, created_at, accepted_at, revoked_at, student:workspace_users!student_workspace_user_id(id, full_name, display_name, email), parent:users!parent_user_id(id, display_name, avatar_url)'
        )
        .eq('ws_id', normalizedWsId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return NextResponse.json({ links: data ?? [] });
    } catch (error) {
      console.error('Failed to list Tulearn parent links:', error);
      return NextResponse.json(
        { message: 'Failed to load parent links' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<Params>(
  async (request, { supabase, user }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const permissions = await getPermissions({
        user,
        wsId: normalizedWsId,
      });
      if (!permissions?.containsPermission('manage_users')) {
        return NextResponse.json({ message: 'Not found' }, { status: 404 });
      }

      const parsed = parentLinkSchema.safeParse(await request.json());
      if (
        !parsed.success ||
        (!parsed.data.parentUserId && !parsed.data.parentEmail)
      ) {
        return NextResponse.json(
          { message: 'Invalid parent link payload' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient();
      if (!(await hasEducationEnabled(normalizedWsId, sbAdmin))) {
        return NextResponse.json(
          { message: 'Tulearn is not enabled for this workspace' },
          { status: 404 }
        );
      }

      const { data: student, error: studentError } = await sbAdmin
        .from('workspace_users')
        .select('id')
        .eq('id', parsed.data.studentWorkspaceUserId)
        .eq('ws_id', normalizedWsId)
        .maybeSingle();

      if (studentError) throw studentError;
      if (!student) {
        return NextResponse.json(
          { message: 'Student not found' },
          { status: 404 }
        );
      }

      const { data: linkedStudent, error: linkedStudentError } = await sbAdmin
        .from('workspace_user_linked_users')
        .select('platform_user_id')
        .eq('ws_id', normalizedWsId)
        .eq('virtual_user_id', parsed.data.studentWorkspaceUserId)
        .eq('platform_user_id', parsed.data.studentPlatformUserId)
        .maybeSingle();
      if (linkedStudentError) throw linkedStudentError;
      if (!linkedStudent) {
        return NextResponse.json(
          { message: 'Student not found' },
          { status: 404 }
        );
      }

      if (parsed.data.parentUserId) {
        // Admins can only propose a link; the parent accepts it themself.
        const { active, pending } = await findOpenParentLinks(sbAdmin, {
          parentUserId: parsed.data.parentUserId,
          studentWorkspaceUserId: parsed.data.studentWorkspaceUserId,
          wsId: normalizedWsId,
        });
        const existingLink = active ?? pending;
        if (existingLink) {
          // Never rewrite an existing link's student identity or acceptance.
          return NextResponse.json({ link: existingLink }, { status: 200 });
        }

        const { data: link, error } = await sbAdmin
          .from('tulearn_parent_student_links')
          .insert({
            accepted_at: null,
            created_by: user.id,
            parent_user_id: parsed.data.parentUserId,
            status: 'pending',
            student_platform_user_id: parsed.data.studentPlatformUserId,
            student_workspace_user_id: parsed.data.studentWorkspaceUserId,
            ws_id: normalizedWsId,
          })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ link }, { status: 201 });
      }

      const parentEmail = parsed.data.parentEmail;
      if (!parentEmail) {
        return NextResponse.json(
          { message: 'Parent email is required' },
          { status: 400 }
        );
      }

      const result = await createAndSendParentInvite(sbAdmin, {
        invitedBy: user.id,
        parentEmail,
        studentWorkspaceUserId: parsed.data.studentWorkspaceUserId,
        wsId: normalizedWsId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { message: 'Failed to send the invitation email' },
          { status: 502 }
        );
      }

      // The single-use token is only delivered to the parent's inbox.
      return NextResponse.json({ invite: result.invite }, { status: 201 });
    } catch (error) {
      console.error('Failed to create Tulearn parent link:', error);
      return NextResponse.json(
        { message: 'Failed to create parent link' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: true }
);
