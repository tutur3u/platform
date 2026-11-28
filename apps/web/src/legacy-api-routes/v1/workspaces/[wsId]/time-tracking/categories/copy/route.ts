import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;

    // Get authenticated user
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: true,
    });
    if (!auth.ok) return auth.response;
    const { user } = auth;
    const supabase = auth.supabase;
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    // Verify workspace access for target workspace
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

    const permissions = await getPermissions({
      user,
      wsId: normalizedWsId,
    });
    if (!permissions) {
      return NextResponse.json(
        { error: 'Failed to resolve permissions' },
        { status: 500 }
      );
    }
    if (
      permissions.withoutPermission('manage_workspace_settings') &&
      permissions.withoutPermission('manage_time_tracking_requests')
    ) {
      return NextResponse.json(
        {
          error: 'Insufficient permissions to manage time tracking categories',
        },
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

    const sourceMemberCheck = await verifyWorkspaceMembershipType({
      wsId: sourceWorkspaceId,
      userId: user.id,
      supabase,
    });

    if (sourceMemberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify source workspace access' },
        { status: 500 }
      );
    }

    if (!sourceMemberCheck.ok) {
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
      .eq('ws_id', normalizedWsId);

    const existingCategoriesMap = new Map<string, string>(
      existingCategories?.map(
        (cat: { name: string; description?: string | null }) => [
          cat.name.toLowerCase(),
          cat.description?.toLowerCase() || '',
        ]
      ) || []
    );

    // Filter out categories that already exist (case-insensitive name matching)
    const categoriesToCreate = sourceCategories.filter(
      (cat: {
        name: string;
        description?: string | null;
        color?: string | null;
      }) => !existingCategoriesMap.has(cat.name.toLowerCase())
    );

    // Identify categories that already exist
    const existingMatchingCategories = sourceCategories.filter(
      (cat: { name: string }) =>
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
    const newCategories = categoriesToCreate.map(
      (cat: {
        name: string;
        description?: string | null;
        color?: string | null;
      }) => ({
        ws_id: normalizedWsId,
        name: cat.name,
        description: cat.description,
        color: cat.color,
      })
    );

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
