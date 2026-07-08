import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

interface RouteParams {
  moduleId: string;
  wsId: string;
}

interface SessionContext {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
}

interface VocabularyEntry {
  definition: string;
  examples: string[];
  id: string;
  pronunciation: string;
  word: string;
}

function normalizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'string' ? record.id.trim() : '';
      const word = typeof record.word === 'string' ? record.word.trim() : '';
      const definition =
        typeof record.definition === 'string' ? record.definition.trim() : '';

      if (!id || !word || !definition) return null;

      return {
        definition,
        examples: Array.isArray(record.examples)
          ? record.examples
              .filter((example): example is string => typeof example === 'string')
              .map((example) => example.trim())
              .filter(Boolean)
          : [],
        id,
        pronunciation:
          typeof record.pronunciation === 'string'
            ? record.pronunciation.trim()
            : '',
        word,
      };
    })
    .filter((entry): entry is VocabularyEntry => entry !== null);
}

async function resolveSessionContext(
  request: NextRequest
): Promise<SessionContext | null> {
  const appSessionVerification = verifyAppSessionRequest(request, {
    targetApp: 'learn',
  });

  if (appSessionVerification.ok) {
    const user = createAppSessionUser(appSessionVerification.claims);
    const supabase = attachSupabaseAuthUser(
      (await createAdminClient({
        noCookie: true,
      })) as TypedSupabaseClient,
      user
    );

    return { supabase, user };
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  return { supabase, user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  const session = await resolveSessionContext(request);

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { moduleId, wsId } = await Promise.resolve(params);
  const normalizedWsId = await normalizeWorkspaceId(wsId, session.supabase);

  const membership = await verifyWorkspaceMembershipType({
    supabase: session.supabase,
    userId: session.user.id,
    wsId: normalizedWsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { message: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_course_modules')
    .select('id, vocabulary, workspace_user_groups!inner(ws_id)')
    .eq('id', moduleId)
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load learner vocabulary', {
      error,
      moduleId,
      wsId: normalizedWsId,
    });

    return NextResponse.json(
      { message: 'Failed to load vocabulary' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }

  return NextResponse.json({
    vocabulary: normalizeVocabulary((data as { vocabulary?: unknown }).vocabulary),
  });
}
