import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface ShareRequest {
  userId?: string;
  email?: string;
}

interface Params {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { wsId, templateId } = await params;

    if (!validate(wsId) || !validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or template ID' },
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
        { error: 'Please sign in to view shares' },
        { status: 401 }
      );
    }

    // Verify user is the template owner
    const { data: template } = await supabase
      .from('board_templates')
      .select('id, created_by')
      .eq('id', templateId)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    if (template.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Only the template owner can view shares' },
        { status: 403 }
      );
    }

    // Fetch shares (RLS will also enforce this)
    const { data: shares, error: fetchError } = await supabase
      .from('board_template_shares')
      .select(
        `
        id,
        user_id,
        email,
        permission,
        created_by,
        created_at
      `
      )
      .eq('template_id', templateId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch shares:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch shares' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      shares: shares || [],
      count: shares?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching shares:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { wsId, templateId } = await params;
    const body: ShareRequest = await req.json();

    const { userId, email } = body;

    if (!validate(wsId) || !validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or template ID' },
        { status: 400 }
      );
    }

    // Must provide either userId or email
    if (!userId && !email) {
      return NextResponse.json(
        { error: 'Either userId or email is required' },
        { status: 400 }
      );
    }

    // Validate userId if provided
    if (userId && !validate(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Basic email validation if provided
    if (email && !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email address' },
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
        { error: 'Please sign in to share templates' },
        { status: 401 }
      );
    }

    // Verify user is the template owner
    const { data: template } = await supabase
      .from('board_templates')
      .select('id, created_by, name')
      .eq('id', templateId)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    if (template.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Only the template owner can share templates' },
        { status: 403 }
      );
    }

    // Prevent sharing with self
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot share a template with yourself' },
        { status: 400 }
      );
    }

    // Check if share already exists
    let existingShareQuery = supabase
      .from('board_template_shares')
      .select('id')
      .eq('template_id', templateId);

    if (userId) {
      existingShareQuery = existingShareQuery.eq('user_id', userId);
    } else if (email) {
      existingShareQuery = existingShareQuery.eq('email', email.toLowerCase());
    }

    const { data: existingShare } = await existingShareQuery.single();

    if (existingShare) {
      return NextResponse.json(
        { error: 'This user already has access to this template' },
        { status: 409 }
      );
    }

    // Create the share (permission is always 'view' per DB constraint)
    const { data: share, error: insertError } = await supabase
      .from('board_template_shares')
      .insert({
        template_id: templateId,
        user_id: userId || null,
        email: email?.toLowerCase() || null,
        permission: 'view',
        created_by: user.id,
      })
      .select('id, user_id, email, permission, created_at')
      .single();

    if (insertError) {
      console.error('Failed to create share:', insertError);
      return NextResponse.json(
        { error: 'Failed to share template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Template shared successfully',
      share: {
        id: share.id,
        userId: share.user_id,
        email: share.email,
        permission: share.permission,
        createdAt: share.created_at,
      },
    });
  } catch (error) {
    console.error('Error sharing template:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { wsId, templateId } = await params;

    if (!validate(wsId) || !validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or template ID' },
        { status: 400 }
      );
    }

    // Get shareId from query params
    const { searchParams } = new URL(req.url);
    const shareId = searchParams.get('shareId');

    if (!shareId || !validate(shareId)) {
      return NextResponse.json(
        { error: 'Invalid or missing share ID' },
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
        { error: 'Please sign in to remove shares' },
        { status: 401 }
      );
    }

    // Verify user is the template owner
    const { data: template } = await supabase
      .from('board_templates')
      .select('id, created_by')
      .eq('id', templateId)
      .single();

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    if (template.created_by !== user.id) {
      return NextResponse.json(
        { error: 'Only the template owner can remove shares' },
        { status: 403 }
      );
    }

    // Delete the share (RLS will also enforce owner access)
    const { error: deleteError } = await supabase
      .from('board_template_shares')
      .delete()
      .eq('id', shareId)
      .eq('template_id', templateId);

    if (deleteError) {
      console.error('Failed to delete share:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove share' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Share removed successfully',
    });
  } catch (error) {
    console.error('Error removing share:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
