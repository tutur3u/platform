import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  BOARD_TEMPLATES_APP_SESSION_AUTH,
  createBoardTemplatesRouteContext,
  handleTemplateRouteError,
  invalidTemplateIdResponse,
  parseTemplateId,
} from '../../_lib';

type Params = {
  templateId: string;
  wsId: string;
};

type ShareRequest = {
  email?: string;
  userId?: string;
};

async function verifyTemplateOwner({
  context,
  templateId,
}: {
  context: Awaited<ReturnType<typeof createBoardTemplatesRouteContext>> & {};
  templateId: string;
}) {
  if (context instanceof NextResponse) return { response: context };

  const { data: template, error } = await context.sbAdmin
    .from('board_templates')
    .select('id, created_by, name')
    .eq('id', templateId)
    .eq('ws_id', context.wsId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch template owner:', error);
    return {
      response: NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      ),
    };
  }

  if (!template) {
    return {
      response: NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      ),
    };
  }

  if (template.created_by !== context.user.id) {
    return {
      response: NextResponse.json(
        { error: 'Only the template owner can manage shares' },
        { status: 403 }
      ),
    };
  }

  return { response: null, template };
}

export const GET = withSessionAuth<Params>(
  async (_request, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const ownerCheck = await verifyTemplateOwner({ context, templateId });
      if (ownerCheck.response) return ownerCheck.response;

      const { data: shares, error } = await context.sbAdmin
        .from('board_template_shares')
        .select('id, user_id, email, permission, created_by, created_at')
        .eq('template_id', templateId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch shares:', error);
        return NextResponse.json(
          { error: 'Failed to fetch shares' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        count: shares?.length ?? 0,
        shares: shares ?? [],
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error fetching shares:');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  async (request: NextRequest, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const { email, userId } = (await request.json()) as ShareRequest;

      if (!userId && !email) {
        return NextResponse.json(
          { error: 'Either userId or email is required' },
          { status: 400 }
        );
      }

      if (userId && !parseTemplateId(userId)) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
      }

      if (email && !email.includes('@')) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const ownerCheck = await verifyTemplateOwner({ context, templateId });
      if (ownerCheck.response) return ownerCheck.response;

      if (userId === context.user.id) {
        return NextResponse.json(
          { error: 'You cannot share a template with yourself' },
          { status: 400 }
        );
      }

      let existingShareQuery = context.sbAdmin
        .from('board_template_shares')
        .select('id')
        .eq('template_id', templateId);

      if (userId) {
        existingShareQuery = existingShareQuery.eq('user_id', userId);
      } else if (email) {
        existingShareQuery = existingShareQuery.eq(
          'email',
          email.toLowerCase()
        );
      }

      const { data: existingShare } = await existingShareQuery.maybeSingle();

      if (existingShare) {
        return NextResponse.json(
          { error: 'This user already has access to this template' },
          { status: 409 }
        );
      }

      const { data: share, error } = await context.sbAdmin
        .from('board_template_shares')
        .insert({
          created_by: context.user.id,
          email: email?.toLowerCase() || null,
          permission: 'view',
          template_id: templateId,
          user_id: userId || null,
        })
        .select('id, user_id, email, permission, created_at')
        .single();

      if (error) {
        console.error('Failed to create share:', error);
        return NextResponse.json(
          { error: 'Failed to share template' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'Template shared successfully',
        share: {
          createdAt: share.created_at,
          email: share.email,
          id: share.id,
          permission: share.permission,
          userId: share.user_id,
        },
        success: true,
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error sharing template:');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  async (request, auth, { templateId, wsId: rawWsId }) => {
    try {
      if (!parseTemplateId(templateId)) return invalidTemplateIdResponse();

      const shareId = new URL(request.url).searchParams.get('shareId');
      if (!shareId || !parseTemplateId(shareId)) {
        return NextResponse.json(
          { error: 'Invalid or missing share ID' },
          { status: 400 }
        );
      }

      const context = await createBoardTemplatesRouteContext(auth, rawWsId);
      if (context instanceof NextResponse) return context;

      const ownerCheck = await verifyTemplateOwner({ context, templateId });
      if (ownerCheck.response) return ownerCheck.response;

      const { error } = await context.sbAdmin
        .from('board_template_shares')
        .delete()
        .eq('id', shareId)
        .eq('template_id', templateId);

      if (error) {
        console.error('Failed to delete share:', error);
        return NextResponse.json(
          { error: 'Failed to remove share' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        message: 'Share removed successfully',
        success: true,
      });
    } catch (error) {
      return handleTemplateRouteError(error, 'Error removing share:');
    }
  },
  { allowAppSessionAuth: BOARD_TEMPLATES_APP_SESSION_AUTH }
);
