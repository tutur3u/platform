import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  handleTemplateRouteError,
  serializeBoardTemplate,
} from './_lib';

type Params = {
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (_request, auth, { wsId: rawWsId }) => {
    try {
      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { data: templates, error } = await context.sbAdmin
        .from('board_templates')
        .select(
          'id, ws_id, created_by, source_board_id, name, description, visibility, background_path, content, created_at, updated_at'
        )
        .eq('ws_id', context.wsId)
        .or(`visibility.neq.private,created_by.eq.${context.user.id}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch board templates', error);
        return NextResponse.json(
          { error: 'Failed to fetch templates' },
          { status: 500 }
        );
      }

      const serializedTemplates = await Promise.all(
        (templates ?? []).map((template) =>
          serializeBoardTemplate(context, template)
        )
      );

      return NextResponse.json({ templates: serializedTemplates });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error listing board templates');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);
