import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createBreakTypeSchema = z.object({
  name: z
    .string()
    .min(1, 'Break type name is required')
    .max(50, 'Break type name must be 50 characters or less'),
  description: z.string().max(MAX_LONG_TEXT_LENGTH).optional().nullable(),
  color: z.enum([
    'RED',
    'ORANGE',
    'YELLOW',
    'GREEN',
    'CYAN',
    'BLUE',
    'INDIGO',
    'PURPLE',
    'PINK',
    'GRAY',
  ]),
  icon: z.enum([
    'Coffee',
    'Utensils',
    'User',
    'Users',
    'Heart',
    'Moon',
    'Sun',
    'Zap',
    'Book',
    'Briefcase',
    'Home',
    'Dumbbell',
    'Music',
    'Gamepad2',
    'Pause',
    'Wind',
  ]),
  isDefault: z.boolean().optional(),
});

// GET /api/v1/workspaces/[wsId]/time-tracking/break-types
// Fetch all break types for a workspace
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(id, supabase);

    // Verify workspace access
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Fetch all break types for the workspace
    const { data: breakTypes, error } = await sbAdmin
      .from('workspace_break_types')
      .select('*')
      .eq('ws_id', normalizedWsId)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ breakTypes });
  } catch (error) {
    console.error('Error fetching break types:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/v1/workspaces/[wsId]/time-tracking/break-types
// Create a new custom break type (workspace admins only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId: id } = await params;
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(id, supabase);

    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = createBreakTypeSchema.safeParse(body);
    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.message },
        { status: 400 }
      );
    }

    const { name, description, color, icon, isDefault } = validatedData.data;

    const sbAdmin = await createAdminClient();

    if (isDefault) {
      const { error: clearDefaultError } = await sbAdmin
        .from('workspace_break_types')
        .update({ is_default: false })
        .eq('ws_id', normalizedWsId)
        .eq('is_default', true);

      if (clearDefaultError) {
        throw clearDefaultError;
      }
    }

    // Create the break type
    const { data: breakType, error } = await sbAdmin
      .from('workspace_break_types')
      .insert({
        ws_id: normalizedWsId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || 'RED',
        icon: icon || 'Coffee',
        is_default: isDefault || false,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A break type with this name already exists' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ breakType }, { status: 201 });
  } catch (error) {
    console.error('Error creating break type:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
