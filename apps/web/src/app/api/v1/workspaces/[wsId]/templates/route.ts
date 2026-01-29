import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view templates' },
        { status: 401 }
      );
    }

    // Parse query params for filtering
    const { searchParams } = new URL(req.url);
    const visibility = searchParams.get('visibility');
    const ownOnly = searchParams.get('own') === 'true';

    // Fetch all accessible templates for this workspace
    // RLS policy (is_board_template_accessible) will filter based on:
    // - Owner access (created_by = user)
    // - Public templates
    // - Workspace-visible templates (if user is workspace member)
    // - Directly shared templates
    let query = supabase
      .from('board_templates')
      .select(
        `
        id,
        ws_id,
        created_by,
        source_board_id,
        name,
        description,
        visibility,
        content,
        created_at,
        updated_at
      `
      )
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    // Apply visibility filter if specified
    if (visibility && ['private', 'workspace', 'public'].includes(visibility)) {
      query = query.eq(
        'visibility',
        visibility as 'private' | 'workspace' | 'public'
      );
    }

    // Filter to own templates only
    if (ownOnly) {
      query = query.eq('created_by', user.id);
    }

    const { data: templates, error: fetchError } = await query;

    if (fetchError) {
      console.error('Failed to fetch templates:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      );
    }

    // Transform templates for response
    const transformedTemplates = (templates || []).map((template) => {
      const content = template.content as {
        lists?: Array<{ tasks?: unknown[] }>;
        labels?: unknown[];
      };

      const stats = {
        lists: content.lists?.length || 0,
        tasks:
          content.lists?.reduce(
            (acc, list) => acc + (list.tasks?.length || 0),
            0
          ) || 0,
        labels: content.labels?.length || 0,
      };

      return {
        id: template.id,
        wsId: template.ws_id,
        createdBy: template.created_by,
        sourceBoardId: template.source_board_id,
        name: template.name,
        description: template.description,
        visibility: template.visibility,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        isOwner: template.created_by === user.id,
        stats,
      };
    });

    return NextResponse.json({
      templates: transformedTemplates,
      count: transformedTemplates.length,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
