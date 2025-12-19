import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

// GET /api/v1/workspaces/[wsId]/time-tracking/break-types
// Fetch all break types for a workspace
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
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
      .eq('ws_id', wsId)
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
      .eq('ws_id', wsId)
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
    const { name, description, color, icon, isDefault } = body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Break type name is required' },
        { status: 400 }
      );
    }

    if (name.length > 50) {
      return NextResponse.json(
        { error: 'Break type name must be 50 characters or less' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Create the break type
    const { data: breakType, error } = await sbAdmin
      .from('workspace_break_types')
      .insert({
        ws_id: wsId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || 'AMBER',
        icon: icon || null,
        is_default: isDefault || false,
        is_system: false, // User-created types are never system types
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
