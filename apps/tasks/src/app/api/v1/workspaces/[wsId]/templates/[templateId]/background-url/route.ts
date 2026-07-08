import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  createTemplateStorageAdmin,
  fetchAccessibleBoardTemplate,
  handleTemplateRouteError,
  invalidTemplateIdResponse,
  parseTemplateId,
} from '../../_lib';

type Params = {
  templateId: string;
  wsId: string;
};

export const GET = withSessionAuth<Params>(
  async (_request, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { response, template } = await fetchAccessibleBoardTemplate(
        context,
        templateId
      );
      if (response) return response;

      if (!template.background_path) {
        return NextResponse.json({ signedUrl: null });
      }

      const storageAdmin = await createTemplateStorageAdmin();
      const { data, error } = await storageAdmin.storage
        .from('workspaces')
        .createSignedUrl(template.background_path, 3600);

      if (error) {
        console.error(
          'Failed to create template background signed URL:',
          error
        );
        return NextResponse.json(
          { error: 'Failed to load template background' },
          { status: 500 }
        );
      }

      return NextResponse.json({ signedUrl: data?.signedUrl ?? null });
    } catch (error) {
      return handleTemplateRouteError(
        error,
        'Error in GET /api/v1/workspaces/[wsId]/templates/[templateId]/background-url:'
      );
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);
