import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; categoryId: string }> }
) {
  try {
    const { wsId, categoryId } = await params;
    const supabase = await createClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { data: categoryCheck } = await supabase
      .from('workspace_calendar_categories')
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
    const { name, color } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: 'Category name is required' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('workspace_calendar_categories')
      .update({
        name: name.trim(),
        color: color || 'BLUE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A category with this name already exists' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ category: data });
  } catch (error) {
    console.error('Error updating calendar category:', error);
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

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { data: categoryCheck } = await supabase
      .from('workspace_calendar_categories')
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

    const sbAdmin = await createAdminClient();

    const { error } = await sbAdmin
      .from('workspace_calendar_categories')
      .delete()
      .eq('id', categoryId);

    if (error) throw error;

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting calendar category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
