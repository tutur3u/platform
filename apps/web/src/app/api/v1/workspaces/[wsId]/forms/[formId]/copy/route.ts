import { type NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceRouteContext,
  parseFormIdParam,
} from '@/features/forms/route-utils';
import {
  fetchFormDefinition,
  saveFormDefinition,
} from '@/features/forms/server';
import {
  remapFormStudioIds,
  toStudioInput,
} from '@/features/forms/studio/studio-utils';

export async function POST(
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
    const form = await fetchFormDefinition(context.adminClient, formId);

    if (!form || form.wsId !== context.wsId) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const studioInput = toStudioInput(form);
    const remapped = remapFormStudioIds(studioInput);
    const copyInput = {
      ...remapped,
      title: `${(form.title || 'Form').trim()} (Copy)`,
      status: 'draft' as const,
    };

    const id = await saveFormDefinition({
      supabase: context.adminClient,
      wsId: context.wsId,
      creatorId: context.user.id,
      input: copyInput,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
