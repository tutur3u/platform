import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';
import { z } from 'zod';

const createBreakTypeSchema = z.object({
  name: z
    .string()
    .min(1, 'Break type name is required')
    .max(50, 'Break type name must be 50 characters or less'),
  description: z.string().optional(),
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
  _: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Fetch all break types for the workspace
    const { data: breakTypes, error } = await supabase
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
    const { wsId } = await params;
    const normalizedWsId = await normalizeWorkspaceId(wsId);
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
