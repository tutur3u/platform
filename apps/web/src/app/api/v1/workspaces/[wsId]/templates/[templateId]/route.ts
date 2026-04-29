import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface UpdateTemplateRequest {
  name?: string;
  description?: string | null;
  visibility?: 'private' | 'workspace' | 'public';
  backgroundPath?: string | null; // Storage path, not URL
}

interface Params {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId: id, templateId } = await params;

    if (!validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(req);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view templates' },
        { status: 401 }
      );
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      console.error(
        'Failed to verify workspace membership:',
        memberCheck.error
      );
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Fetch the template (RLS will handle access control)
    const { data: template, error: fetchError } = await sbAdmin
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
        background_path,
        created_at,
        updated_at
      `
      )
      .eq('id', templateId)
      .single();

    if (
      template &&
      template.visibility !== 'public' &&
      template.ws_id !== wsId
    ) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 404 });
    }

    if (
      template &&
      template.visibility === 'private' &&
      template.created_by !== user.id
    ) {
      return NextResponse.json({ error: 'Access Denied' }, { status: 404 });
    }

    if (fetchError || !template) {
      console.error('Failed to fetch template:', fetchError);
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      );
    }

    // Calculate stats from content
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

    // Check if current user is owner
    const isOwner = template.created_by === user.id;

    return NextResponse.json({
      template: {
        id: template.id,
        wsId: template.ws_id,
        createdBy: template.created_by,
        sourceBoardId: template.source_board_id,
        name: template.name,
        description: template.description,
        visibility: template.visibility,
        content: template.content,
        backgroundPath: template.background_path,
        createdAt: template.created_at,
        updatedAt: template.updated_at,
        isOwner,
        stats,
      },
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { wsId: id, templateId } = await params;
    const body: UpdateTemplateRequest = await req.json();

    const { name, description, visibility, backgroundPath } = body;

    if (!validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    // Validate visibility if provided
    if (
      visibility &&
      !['private', 'workspace', 'public'].includes(visibility)
    ) {
      return NextResponse.json(
        { error: 'Invalid visibility value' },
        { status: 400 }
      );
    }

    const supabase = await createClient(req);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to update templates' },
        { status: 401 }
      );
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      console.error(
        'Failed to verify workspace membership:',
        memberCheck.error
      );
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Build update object
    const updateData: TablesUpdate<'board_templates'> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      if (name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Template name cannot be empty' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (visibility !== undefined) {
      updateData.visibility = visibility;
    }

    if (backgroundPath !== undefined) {
      updateData.background_path = backgroundPath;
    }

    // Update the template (RLS will enforce owner-only access)
    const { data: template, error: updateError } = await sbAdmin
      .from('board_templates')
      .update(updateData)
      .eq('id', templateId)
      .eq('ws_id', wsId)
      .eq('created_by', user.id) // Explicit owner check for extra safety
      .select('id, name, description, visibility, updated_at')
      .maybeSingle();

    if (updateError) {
      console.error('Failed to update template:', updateError);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found or you are not the owner' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template updated successfully',
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        visibility: template.visibility,
        updatedAt: template.updated_at,
      },
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { wsId: id, templateId } = await params;

    if (!validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid template ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(req);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to delete templates' },
        { status: 401 }
      );
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Verify workspace access
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      console.error(
        'Failed to verify workspace membership:',
        memberCheck.error
      );
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: deletedTemplate, error: deleteError } = await sbAdmin
      .from('board_templates')
      .delete()
      .eq('id', templateId)
      .eq('ws_id', wsId)
      .eq('created_by', user.id)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      console.error('Failed to delete template:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete template' },
        { status: 500 }
      );
    }

    if (!deletedTemplate) {
      return NextResponse.json(
        { error: 'Template not found or you are not the owner' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
