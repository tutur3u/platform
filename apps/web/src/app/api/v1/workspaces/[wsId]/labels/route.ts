import { createClient } from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isTaskLabelColorPreset, normalizeTaskLabelColor } from './label-color';

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
    .min(1, 'Color is required')
    .transform((value) => normalizeTaskLabelColor(value))
    .refine((value) => isTaskLabelColorPreset(value), {
      message: 'Color must be one of the supported preset colors',
    }),
});

// GET - Fetch all labels for a workspace
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Verify membership in the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: labels, error } = await supabase
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
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Check if user has access to the workspace
    const { data: workspaceMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create the label
    const { data: newLabel, error: createError } = await supabase
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
