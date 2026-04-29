import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{
    wsId: string;
  }>;
}

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
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);

    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
}

// POST - Create a new label
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id } = await params;

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
    const supabase = await createClient(request);

    // Get current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
}
