import {
  createAdminClient,
  createClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

interface Params {
  params: Promise<{
    wsId: string;
    templateId: string;
  }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { wsId, templateId } = await params;

    if (!validate(templateId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID or template ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(req);

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

    const { data: memberCheck, error: membershipError } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('Failed to verify workspace membership:', membershipError);
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    const { data: template, error: templateError } = await sbAdmin
      .from('board_templates')
      .select('background_path')
      .eq('id', templateId)
      .eq('ws_id', wsId)
      .single();

    if (templateError) {
      console.error('Failed to fetch template background path:', templateError);
      return NextResponse.json(
        { error: 'Failed to load template' },
        { status: 500 }
      );
    }

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      );
    }

    if (!template.background_path) {
      return NextResponse.json({ signedUrl: null });
    }

    const sbStorageAdmin = await createDynamicAdminClient();

    const { data: signedUrlData, error: signedUrlError } =
      await sbStorageAdmin.storage
        .from('workspaces')
        .createSignedUrl(template.background_path, 3600);

    if (signedUrlError) {
      console.error(
        'Failed to create template background signed URL:',
        signedUrlError
      );
      return NextResponse.json(
        { error: 'Failed to load template background' },
        { status: 500 }
      );
    }

    return NextResponse.json({ signedUrl: signedUrlData?.signedUrl ?? null });
  } catch (error) {
    console.error(
      'Error in GET /api/v1/workspaces/[wsId]/templates/[templateId]/background-url:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
