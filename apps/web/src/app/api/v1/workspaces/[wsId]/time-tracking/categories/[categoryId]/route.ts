import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; categoryId: string }> }
) {
  try {
    const { wsId, categoryId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
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

    const sbAdmin = await createAdminClient();

    // Verify category belongs to workspace
    const { data: categoryCheck, error: categoryCheckError } = await sbAdmin
      .from('time_tracking_categories')
      .select('id')
      .eq('id', categoryId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (categoryCheckError) {
      return NextResponse.json(
        { error: 'Failed to verify category' },
        { status: 500 }
      );
    }

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

    const { data, error } = await sbAdmin
      .from('time_tracking_categories')
      .update({
        name: name.trim(),
        description: description?.trim() || null,
        color: color || 'BLUE',
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .eq('ws_id', normalizedWsId)
      .select('*')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

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
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; categoryId: string }> }
) {
  try {
    const { wsId, categoryId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
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

    const sbAdmin = await createAdminClient();

    // Verify category belongs to workspace
    const { data: categoryCheck, error: categoryCheckError } = await sbAdmin
      .from('time_tracking_categories')
      .select('id, name')
      .eq('id', categoryId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (categoryCheckError) {
      return NextResponse.json(
        { error: 'Failed to verify category' },
        { status: 500 }
      );
    }

    if (!categoryCheck) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    const { data: deletedCategories, error } = await sbAdmin
      .from('time_tracking_categories')
      .delete()
      .eq('id', categoryId)
      .eq('ws_id', normalizedWsId)
      .select('id');

    if (error) throw error;

    if (!deletedCategories || deletedCategories.length === 0) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting time tracking category:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
