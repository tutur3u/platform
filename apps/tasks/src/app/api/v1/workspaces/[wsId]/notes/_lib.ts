import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SessionAuthContext } from '@/lib/api-auth';

export const TASK_NOTES_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export type NotesRouteContext = {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
};

// TipTap JSONContent schema for rich text.
const jsonContentSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    attrs: z.record(z.string(), z.any()).optional(),
    content: z.array(jsonContentSchema).optional(),
    marks: z.array(z.any()).optional(),
    text: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    type: z.string().max(MAX_SHORT_TEXT_LENGTH),
  })
);

export const createNoteSchema = z.object({
  content: jsonContentSchema.refine(
    (val) => val.type === 'doc',
    'Content must be a valid TipTap document'
  ),
  title: z.string().max(MAX_NOTE_TITLE_LENGTH).nullable().optional(),
});

export const updateNoteSchema = z.object({
  content: jsonContentSchema
    .refine(
      (val) => val.type === 'doc',
      'Content must be a valid TipTap document'
    )
    .optional(),
  title: z.string().max(MAX_NAME_LENGTH).nullable().optional(),
});

export async function createNotesRouteContext(
  { supabase, user }: SessionAuthContext,
  rawWsId: string
): Promise<NextResponse | NotesRouteContext> {
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const membership = await verifyWorkspaceMembershipType({
    supabase,
    userId: user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { supabase, user, wsId };
}

export function handleNotesRouteError(error: unknown, message: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(message, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
