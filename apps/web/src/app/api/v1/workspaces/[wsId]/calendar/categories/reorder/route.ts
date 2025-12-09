import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

interface ReorderItem {
  id: string;
  position: number;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const body = await request.json();
    const { categories } = body as { categories: ReorderItem[] };

    if (!categories || !Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { error: 'Categories array is required' },
        { status: 400 }
      );
    }

    // Validate all category IDs belong to this workspace
    const categoryIds = categories.map((c) => c.id);
    const { data: existingCategories, error: fetchError } = await supabase
      .from('workspace_calendar_categories')
      .select('id')
      .eq('ws_id', wsId)
      .in('id', categoryIds);

    if (fetchError) throw fetchError;

    if (
      !existingCategories ||
      existingCategories.length !== categoryIds.length
    ) {
      return NextResponse.json(
        { error: 'One or more categories not found in this workspace' },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Update positions for each category
    const updatePromises = categories.map((item) =>
      sbAdmin
        .from('workspace_calendar_categories')
        .update({
          position: item.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('ws_id', wsId)
    );

    const results = await Promise.all(updatePromises);

    // Check for any errors
    const hasError = results.some((r) => r.error);
    if (hasError) {
      const errors = results.filter((r) => r.error).map((r) => r.error);
      console.error('Errors updating positions:', errors);
      throw new Error('Failed to update some category positions');
    }

    // Fetch and return updated categories
    const { data: updatedCategories, error: refetchError } = await supabase
      .from('workspace_calendar_categories')
      .select('*')
      .eq('ws_id', wsId)
      .order('position');

    if (refetchError) throw refetchError;

    return NextResponse.json({ categories: updatedCategories });
  } catch (error) {
    console.error('Error reordering calendar categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
