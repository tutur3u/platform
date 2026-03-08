import { type NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceRouteContext,
  parseFormIdParam,
} from '@/features/forms/route-utils';
import { generateFormShareCode } from '@/features/forms/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; formId: string }> }
) {
  try {
    const { wsId: wsIdParam, formId: formIdParam } = await params;
    const context = await getWorkspaceRouteContext(request, wsIdParam);

    if (!context.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!context.isMember || !context.canManageForms) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formId = parseFormIdParam(formIdParam, 'form ID');
    const existing = await context.adminClient
      .from('form_share_links')
      .select('code, active')
      .eq('form_id', formId)
      .maybeSingle();

    if (existing.data) {
      return NextResponse.json({ shareLink: existing.data });
    }

    const { data, error } = await context.adminClient
      .from('form_share_links')
      .insert({
        form_id: formId,
        code: generateFormShareCode(),
        created_by_user_id: context.user.id,
      })
      .select('code, active')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ shareLink: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
