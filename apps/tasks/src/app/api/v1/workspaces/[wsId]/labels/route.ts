import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

interface RouteParams {
  wsId: string;
}

const TASK_LABELS_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

const LabelSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  color: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
      message: 'Color must be a valid hex color code',
    }),
});

// GET - Fetch all labels for a workspace
export const GET = withSessionAuth<RouteParams>(
  async (_request, { supabase, user }, { wsId: id }) => {
    try {
      const wsId = await normalizeWorkspaceId(id, supabase);

      // Verify membership in the workspace
      const workspaceMember = await verifyWorkspaceMembershipType({
        wsId: wsId,
        userId: user.id,
        supabase: supabase,
      });

      if (workspaceMember.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace membership' },
          { status: 500 }
        );
      }

      if (!workspaceMember.ok) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const sbAdmin = await createAdminClient();

      const { data: labels, error } = await sbAdmin
        .from('workspace_task_labels')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching labels:', error);
        return NextResponse.json(
          { error: 'Failed to fetch labels' },
          { status: 500 }
        );
      }

      return NextResponse.json(labels);
    } catch (error) {
      console.error('Unexpected error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_LABELS_APP_SESSION_AUTH }
);

// POST - Create a new label
export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId: id }) => {
    try {
      const body = await request.json();
      const data = LabelSchema.safeParse(body);

      if (!data.success) {
        console.error('Validation error:', data.error);
        return NextResponse.json(
          { error: 'Invalid label data' },
          { status: 400 }
        );
      }

      const { name, color } = data.data;
      const wsId = await normalizeWorkspaceId(id, supabase);

      // Check if user has access to the workspace
      const workspaceMember = await verifyWorkspaceMembershipType({
        wsId,
        userId: user.id,
        supabase,
      });

      if (workspaceMember.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!workspaceMember.ok) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Create the label
      const sbAdmin = await createAdminClient();

      const { data: newLabel, error: createError } = await sbAdmin
        .from('workspace_task_labels')
        .insert({
          name: name.trim(),
          color,
          ws_id: wsId,
          creator_id: user.id,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating label:', createError);
        return NextResponse.json(
          { error: 'Failed to create label' },
          { status: 500 }
        );
      }

      return NextResponse.json(newLabel, { status: 201 });
    } catch (error) {
      console.error('Unexpected error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_LABELS_APP_SESSION_AUTH }
);
