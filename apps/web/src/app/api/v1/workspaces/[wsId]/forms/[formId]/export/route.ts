import { type NextRequest, NextResponse } from 'next/server';
import {
  getWorkspaceRouteContext,
  parseFormIdParam,
} from '@/features/forms/route-utils';
import { FORM_EXPORT_FORMAT_VERSION } from '@/features/forms/schema';
import { fetchFormDefinition } from '@/features/forms/server';
import { toStudioInput } from '@/features/forms/studio/studio-utils';

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

    if (
      !context.isMember ||
      (!context.canManageForms && !context.canViewAnalytics)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formId = parseFormIdParam(formIdParam, 'form ID');
    const definition = await fetchFormDefinition(context.adminClient, formId);

    if (!definition || definition.wsId !== context.wsId) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const envelope = {
      formatVersion: FORM_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      form: toStudioInput(definition),
    };
    const safeTitle = (definition.title || 'form')
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    const fileName = `${safeTitle || 'form'}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(envelope, null, 2), {
      headers: {
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
