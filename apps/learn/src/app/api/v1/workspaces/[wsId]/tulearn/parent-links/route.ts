import { createHash, randomBytes } from 'node:crypto';
import { hasEducationEnabled } from '@tuturuuu/education-core/tulearn/service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesInsert } from '@tuturuuu/types/supabase';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

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
  async (request, { supabase }, { wsId }) => {
    try {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const permissions = await getPermissions({
        request,
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
        request,
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

      if (parsed.data.parentUserId) {
        const { data: existingLink, error: existingLinkError } = await sbAdmin
          .from('tulearn_parent_student_links')
          .select('id')
          .eq('ws_id', normalizedWsId)
          .eq('parent_user_id', parsed.data.parentUserId)
          .eq('student_workspace_user_id', parsed.data.studentWorkspaceUserId)
          .eq('status', 'active')
          .maybeSingle();

        if (existingLinkError) throw existingLinkError;

        const basePayload = {
          student_platform_user_id: parsed.data.studentPlatformUserId,
          accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const linkMutation = existingLink
          ? sbAdmin
              .from('tulearn_parent_student_links')
              .update(basePayload)
              .eq('id', existingLink.id)
              .select()
              .single()
          : sbAdmin
              .from('tulearn_parent_student_links')
              .insert({
                ...basePayload,
                ws_id: normalizedWsId,
                parent_user_id: parsed.data.parentUserId,
                student_workspace_user_id: parsed.data.studentWorkspaceUserId,
                status: 'active',
                created_by: user.id,
              })
              .select()
              .single();

        const { data: link, error } = await linkMutation;

        if (error) throw error;
        return NextResponse.json(
          { link },
          { status: existingLink ? 200 : 201 }
        );
      }

      const parentEmail = parsed.data.parentEmail;
      if (!parentEmail) {
        return NextResponse.json(
          { message: 'Parent email is required' },
          { status: 400 }
        );
      }

      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const invitePayload: TablesInsert<'tulearn_parent_invites'> = {
        ws_id: normalizedWsId,
        student_workspace_user_id: parsed.data.studentWorkspaceUserId,
        parent_email: parentEmail,
        token_hash: tokenHash,
        invited_by: user.id,
        expires_at: expiresAt.toISOString(),
      };
      const { data: invite, error } = await sbAdmin
        .from('tulearn_parent_invites')
        .insert(invitePayload)
        .select(
          'id, ws_id, student_workspace_user_id, parent_email, status, expires_at'
        )
        .single();

      if (error) throw error;
      return NextResponse.json({ invite, token }, { status: 201 });
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
