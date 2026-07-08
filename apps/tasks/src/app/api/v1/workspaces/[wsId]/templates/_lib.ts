import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createDynamicAdminClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { Tables } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';

export const BOARD_TEMPLATES_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export const templateIdSchema = z.guid();

export const templateVisibilitySchema = z.enum([
  'private',
  'workspace',
  'public',
]);

export type BoardTemplateVisibility = z.infer<typeof templateVisibilitySchema>;

export type BoardTemplatesRouteContext = {
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
};

type BoardTemplateContent = {
  labels?: unknown[];
  lists?: Array<{ tasks?: unknown[] }>;
  settings?: Record<string, unknown>;
};

type BoardTemplateRow = Pick<
  Tables<'board_templates'>,
  | 'background_path'
  | 'content'
  | 'created_at'
  | 'created_by'
  | 'description'
  | 'id'
  | 'name'
  | 'source_board_id'
  | 'updated_at'
  | 'visibility'
  | 'ws_id'
>;

export async function createBoardTemplatesRouteContext(
  { supabase, user }: SessionAuthContext,
  rawWsId: string
): Promise<BoardTemplatesRouteContext | NextResponse> {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    supabase,
    userId: user.id,
    wsId,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { error: 'Access denied to workspace' },
      { status: 403 }
    );
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;

  return { sbAdmin, supabase, user, wsId };
}

export function invalidTemplateIdResponse() {
  return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
}

export function parseTemplateId(templateId: string) {
  return templateIdSchema.safeParse(templateId).success;
}

function getTemplateStats(content: unknown) {
  const templateContent = (content ?? {}) as BoardTemplateContent;

  return {
    labels: templateContent.labels?.length ?? 0,
    lists: templateContent.lists?.length ?? 0,
    tasks:
      templateContent.lists?.reduce(
        (total, list) => total + (list.tasks?.length ?? 0),
        0
      ) ?? 0,
  };
}

export async function serializeBoardTemplate(
  context: Pick<BoardTemplatesRouteContext, 'sbAdmin' | 'user'>,
  template: BoardTemplateRow,
  options?: { includeContent?: boolean }
) {
  let backgroundUrl: string | null = null;

  if (template.background_path) {
    const { data, error } = await context.sbAdmin.storage
      .from('workspaces')
      .createSignedUrl(template.background_path, 3600);

    if (error) {
      console.error('Failed to sign board template background URL', error);
    }

    backgroundUrl = data?.signedUrl ?? null;
  }

  return {
    backgroundPath: template.background_path,
    backgroundUrl,
    content: options?.includeContent ? template.content : undefined,
    createdAt: template.created_at,
    createdBy: template.created_by,
    description: template.description,
    id: template.id,
    isOwner: template.created_by === context.user.id,
    name: template.name,
    sourceBoardId: template.source_board_id,
    stats: getTemplateStats(template.content),
    updatedAt: template.updated_at,
    visibility: template.visibility,
    wsId: template.ws_id,
  };
}

export function canAccessTemplate({
  template,
  userId,
  wsId,
}: {
  template: Pick<BoardTemplateRow, 'created_by' | 'visibility' | 'ws_id'>;
  userId: string;
  wsId: string;
}) {
  if (template.visibility === 'public') return true;
  if (template.ws_id !== wsId) return false;
  if (template.visibility === 'private' && template.created_by !== userId) {
    return false;
  }
  return true;
}

export async function fetchAccessibleBoardTemplate(
  context: BoardTemplatesRouteContext,
  templateId: string
) {
  const { data: template, error } = await context.sbAdmin
    .from('board_templates')
    .select(
      'id, ws_id, created_by, source_board_id, name, description, visibility, content, background_path, created_at, updated_at'
    )
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch board template:', error);
    return {
      response: NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      ),
      template: null,
    };
  }

  if (
    !template ||
    !canAccessTemplate({
      template,
      userId: context.user.id,
      wsId: context.wsId,
    })
  ) {
    return {
      response: NextResponse.json(
        { error: 'Template not found or access denied' },
        { status: 404 }
      ),
      template: null,
    };
  }

  return { response: null, template: template as BoardTemplateRow };
}

export async function createTemplateStorageAdmin() {
  return createDynamicAdminClient();
}

export function handleTemplateRouteError(error: unknown, message: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { details: error.issues, error: 'Invalid request data' },
      { status: 400 }
    );
  }

  console.error(message, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
