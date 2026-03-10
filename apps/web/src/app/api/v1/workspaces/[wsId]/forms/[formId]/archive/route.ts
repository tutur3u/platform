import { type NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceRouteContext,
  parseFormIdParam,
} from '@/features/forms/route-utils';

export async function PATCH(
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
    const body = (await request.json()) as { archived?: boolean };
    const archived = body.archived === true;
    const nextStatus = archived ? 'closed' : 'draft';

    const { data: updated, error } = await context.adminClient
      .from('forms')
      .update({
        status: nextStatus,
        closed_at: archived ? new Date().toISOString() : null,
      })
      .eq('id', formId)
      .eq('ws_id', context.wsId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!updated) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
