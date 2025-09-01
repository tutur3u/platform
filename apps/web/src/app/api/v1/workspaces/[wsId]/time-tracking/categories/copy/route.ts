import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

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

    // Verify workspace access for target workspace
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
    const { sourceWorkspaceId, categoryIds } = body;

    if (!sourceWorkspaceId || !Array.isArray(categoryIds)) {
      return NextResponse.json(
        { error: 'Source workspace ID and category IDs are required' },
        { status: 400 }
      );
    }

    // Verify access to source workspace
    const { data: sourceMemberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', sourceWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!sourceMemberCheck) {
      return NextResponse.json(
        { error: 'Source workspace access denied' },
        { status: 403 }
      );
    }

    // Get categories from source workspace
    const { data: sourceCategories, error: sourceCategoriesError } =
      await supabase
        .from('time_tracking_categories')
        .select('name, description, color')
        .eq('ws_id', sourceWorkspaceId)
        .in('id', categoryIds);

    if (sourceCategoriesError) {
      return NextResponse.json(
        { error: 'Failed to fetch source categories' },
        { status: 500 }
      );
    }

    if (!sourceCategories || sourceCategories.length === 0) {
      return NextResponse.json(
        { error: 'No categories found to copy' },
        { status: 404 }
      );
    }

    // Get existing category names in target workspace to avoid duplicates
    const { data: existingCategories } = await supabase
      .from('time_tracking_categories')
      .select('name, description')
      .eq('ws_id', wsId);

    const existingCategoriesMap = new Map(
      existingCategories?.map((cat) => [
        cat.name.toLowerCase(),
        cat.description?.toLowerCase() || '',
      ]) || []
    );

    // Filter out categories that already exist (case-insensitive name matching)
    const categoriesToCreate = sourceCategories.filter(
      (cat) => !existingCategoriesMap.has(cat.name.toLowerCase())
    );

    // Identify categories that already exist
    const existingMatchingCategories = sourceCategories.filter((cat) =>
      existingCategoriesMap.has(cat.name.toLowerCase())
    );

    if (categoriesToCreate.length === 0) {
      return NextResponse.json(
        {
          message: 'All selected categories already exist in this workspace',
          copiedCount: 0,
          skippedCount: sourceCategories.length,
          existingCategories: existingMatchingCategories,
        },
        { status: 200 }
      );
    }

    // Create new categories in target workspace
    const newCategories = categoriesToCreate.map((cat) => ({
      ws_id: wsId,
      name: cat.name,
      description: cat.description,
      color: cat.color,
    }));

    const { data: createdCategories, error: createError } = await supabase
      .from('time_tracking_categories')
      .insert(newCategories)
      .select('*');

    if (createError) {
      console.error('Error creating categories:', createError);
      return NextResponse.json(
        { error: 'Failed to create categories' },
        { status: 500 }
      );
    }

    const skippedCount = sourceCategories.length - categoriesToCreate.length;

    return NextResponse.json({
      message: `Successfully copied ${categoriesToCreate.length} categories`,
      categories: createdCategories,
      copiedCount: categoriesToCreate.length,
      skippedCount,
      existingCategories: existingMatchingCategories,
    });
  } catch (error) {
    console.error('Error copying categories:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
