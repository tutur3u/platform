import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; categoryId: string }> }
) {
  try {
    const { wsId, categoryId } = await params;
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

    // Verify category belongs to workspace
    const { data: categoryCheck } = await supabase
      .from('time_tracking_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', wsId)
      .single();

    if (!categoryCheck) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, color } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    // Use admin client for update
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('time_tracking_categories')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || 'BLUE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ category: data });
  } catch (error) {
    console.error('Error updating time tracking category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ wsId: string; categoryId: string }> }
) {
  try {
    const { wsId, categoryId } = await params;
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

    // Verify category belongs to workspace
    const { data: categoryCheck } = await supabase
      .from('time_tracking_categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('ws_id', wsId)
      .single();

    if (!categoryCheck) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    // Use admin client for deletion
    const sbAdmin = await createAdminClient();

    const { error } = await sbAdmin
      .from('time_tracking_categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting time tracking category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
