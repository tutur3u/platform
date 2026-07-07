import type { TablesUpdate } from '@tuturuuu/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  fetchAccessibleBoardTemplate,
  handleTemplateRouteError,
  invalidTemplateIdResponse,
  parseTemplateId,
  serializeBoardTemplate,
  templateVisibilitySchema,
} from '../_lib';

type Params = {
  templateId: string;
  wsId: string;
};

type UpdateTemplateRequest = {
  backgroundPath?: string | null;
  description?: string | null;
  name?: string;
  visibility?: 'private' | 'workspace' | 'public';
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

      return NextResponse.json({
        template: await serializeBoardTemplate(context, template, {
          includeContent: true,
        }),
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error fetching template');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);

export const PATCH = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const body = (await request.json()) as UpdateTemplateRequest;
      const { backgroundPath, description, name, visibility } = body;

      if (
        visibility &&
        !templateVisibilitySchema.safeParse(visibility).success
      ) {
        return NextResponse.json(
          { error: 'Invalid visibility value' },
          { status: 400 }
        );
      }

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

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

      const { data: template, error } = await context.sbAdmin
        .from('board_templates')
        .update(updateData)
        .eq('id', templateId)
        .eq('ws_id', context.wsId)
        .eq('created_by', context.user.id)
        .select('id, name, description, visibility, updated_at')
        .maybeSingle();

      if (error) {
        console.error('Failed to update template:', error);
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
        message: 'Template updated successfully',
        success: true,
        template: {
          description: template.description,
          id: template.id,
          name: template.name,
          updatedAt: template.updated_at,
          visibility: template.visibility,
        },
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error updating template');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  async (_request, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const { data: deletedTemplate, error } = await context.sbAdmin
        .from('board_templates')
        .delete()
        .eq('id', templateId)
        .eq('ws_id', context.wsId)
        .eq('created_by', context.user.id)
        .select('id')
        .maybeSingle();

      if (error) {
        console.error('Failed to delete template:', error);
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
        message: 'Template deleted successfully',
        success: true,
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error deleting template');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);
