import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPermissions,
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
  imageUrl?: string;
  pronunciation: string;
  word: string;
}

type VocabularyParseResult =
  | {
      ok: true;
      vocabulary: VocabularyEntry[];
    }
  | {
      errors: string[];
      ok: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateVocabularyEntry(
  value: unknown,
  index: number
): { entry: VocabularyEntry; ok: true } | { error: string; ok: false } {
  if (!isRecord(value)) {
    return {
      error: `Vocabulary item ${index + 1} must be an object.`,
      ok: false,
    };
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const word = typeof value.word === 'string' ? value.word.trim() : '';
  const pronunciation =
    typeof value.pronunciation === 'string' ? value.pronunciation.trim() : '';
  const definition =
    typeof value.definition === 'string' ? value.definition.trim() : '';
  const imageUrl = typeof value.imageUrl === 'string' ? value.imageUrl : '';
  const examples = Array.isArray(value.examples) ? value.examples : null;

  if (!id) {
    return {
      error: `Vocabulary item ${index + 1} is missing an id.`,
      ok: false,
    };
  }

  if (!word || word.length > 255) {
    return {
      error: `Vocabulary item ${index + 1} must have a word up to 255 characters.`,
      ok: false,
    };
  }

  if (pronunciation.length > 255) {
    return {
      error: `Vocabulary item ${index + 1} pronunciation must be 255 characters or less.`,
      ok: false,
    };
  }

  if (!definition || definition.length > 2000) {
    return {
      error: `Vocabulary item ${index + 1} must have a definition up to 2000 characters.`,
      ok: false,
    };
  }

  if (imageUrl) {
    const isDataUri = imageUrl.startsWith('data:image/');
    const isHttpUri =
      imageUrl.startsWith('http://') || imageUrl.startsWith('https://');

    if (!isDataUri && !isHttpUri) {
      return {
        error: `Vocabulary item ${index + 1} image must be an uploaded image or a valid URL.`,
        ok: false,
      };
    }

    if (isDataUri && imageUrl.length > 7_200_000) {
      return {
        error: `Vocabulary item ${index + 1} uploaded image must be under 5MB.`,
        ok: false,
      };
    }

    if (isHttpUri && imageUrl.length > 2000) {
      return {
        error: `Vocabulary item ${index + 1} image URL must be 2000 characters or less.`,
        ok: false,
      };
    }
  }

  if (!examples || examples.length > 20) {
    return {
      error: `Vocabulary item ${index + 1} must have 20 examples or fewer.`,
      ok: false,
    };
  }

  const normalizedExamples: string[] = [];

  for (const [exampleIndex, example] of examples.entries()) {
    if (typeof example !== 'string') {
      return {
        error: `Vocabulary item ${index + 1} example ${exampleIndex + 1} must be text.`,
        ok: false,
      };
    }

    const normalizedExample = example.trim();

    if (!normalizedExample || normalizedExample.length > 500) {
      return {
        error: `Vocabulary item ${index + 1} example ${exampleIndex + 1} must be between 1 and 500 characters.`,
        ok: false,
      };
    }

    normalizedExamples.push(normalizedExample);
  }

  return {
    entry: {
      definition,
      examples: normalizedExamples,
      id,
      imageUrl,
      pronunciation,
      word,
    },
    ok: true,
  };
}

function parseVocabularyUpdate(body: unknown): VocabularyParseResult {
  if (!isRecord(body)) {
    return {
      errors: ['Request body must be an object.'],
      ok: false,
    };
  }

  const extraKeys = Object.keys(body).filter((key) => key !== 'vocabulary');
  if (extraKeys.length > 0) {
    return {
      errors: [`Unexpected fields: ${extraKeys.join(', ')}`],
      ok: false,
    };
  }

  if (!Array.isArray(body.vocabulary)) {
    return {
      errors: ['`vocabulary` must be an array.'],
      ok: false,
    };
  }

  if (body.vocabulary.length > 500) {
    return {
      errors: ['Vocabulary is limited to 500 items per lesson.'],
      ok: false,
    };
  }

  const vocabulary: VocabularyEntry[] = [];

  for (const [index, item] of body.vocabulary.entries()) {
    const parsedEntry = validateVocabularyEntry(item, index);

    if (!parsedEntry.ok) {
      return {
        errors: [parsedEntry.error],
        ok: false,
      };
    }

    vocabulary.push(parsedEntry.entry);
  }

  return {
    ok: true,
    vocabulary,
  };
}

async function resolveSessionContext(
  request: NextRequest
): Promise<SessionContext | null> {
  const appSessionVerification = verifyAppSessionRequest(request, {
    targetApp: 'teach',
  });

  if (appSessionVerification.ok) {
    const user = createAppSessionUser(appSessionVerification.claims);
    const supabase = attachSupabaseAuthUser(
      (await createAdminClient({
        noCookie: true,
      })) as TypedSupabaseClient,
      user
    );

    return {
      supabase,
      user,
    };
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    supabase,
    user,
  };
}

async function withTeachSessionAuth<T>(
  request: NextRequest,
  params: Promise<T> | T,
  handler: (context: SessionContext, resolvedParams: T) => Promise<NextResponse>
) {
  const session = await resolveSessionContext(request);

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return handler(session, await Promise.resolve(params));
}

async function validateWorkspaceModuleAccess(
  wsId: string,
  moduleId: string,
  userId: string,
  sessionSupabase: TypedSupabaseClient
) {
  const normalizedWsId = await normalizeWorkspaceId(wsId, sessionSupabase);

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase: sessionSupabase,
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

  const permissions = await getPermissions({
    user: { id: userId },
    wsId: normalizedWsId,
  });

  if (!permissions?.containsPermission('manage_users')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: module, error: moduleError } = await sbAdmin
    .from('workspace_course_modules')
    .select('id, group_id, workspace_user_groups!inner(ws_id)')
    .eq('id', moduleId)
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .maybeSingle();

  if (moduleError) {
    console.error('Failed to validate vocabulary module access', {
      error: moduleError,
      moduleId,
      wsId: normalizedWsId,
    });
    return NextResponse.json(
      { message: 'Failed to validate module' },
      { status: 500 }
    );
  }

  if (!module) {
    return NextResponse.json({ message: 'Module not found' }, { status: 404 });
  }

  return { module, sbAdmin };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  return withTeachSessionAuth(request, params, async (context, resolved) => {
    const access = await validateWorkspaceModuleAccess(
      resolved.wsId,
      resolved.moduleId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const { data, error } = await access.sbAdmin
      .from('workspace_course_modules')
      .select('id, vocabulary')
      .eq('id', resolved.moduleId)
      .eq('group_id', access.module.group_id)
      .maybeSingle();

    if (error) {
      console.error('Failed to load lesson vocabulary', {
        error,
        moduleId: resolved.moduleId,
      });
      return NextResponse.json(
        { message: 'Failed to load lesson vocabulary' },
        { status: 500 }
      );
    }

    const vocabulary = Array.isArray(
      (data as { vocabulary?: unknown } | null)?.vocabulary
    )
      ? ((data as { vocabulary?: VocabularyEntry[] }).vocabulary ?? [])
      : [];

    return NextResponse.json({ vocabulary });
  });
}

async function updateVocabulary(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> | RouteParams }
) {
  return withTeachSessionAuth(request, params, async (context, resolved) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid request body' },
        { status: 400 }
      );
    }

    const parsed = parseVocabularyUpdate(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { message: 'Invalid request body', errors: parsed.errors },
        { status: 400 }
      );
    }

    const access = await validateWorkspaceModuleAccess(
      resolved.wsId,
      resolved.moduleId,
      context.user.id,
      context.supabase
    );
    if (access instanceof NextResponse) return access;

    const { data, error } = await access.sbAdmin
      .from('workspace_course_modules')
      .update({ vocabulary: parsed.vocabulary } as never)
      .eq('id', resolved.moduleId)
      .eq('group_id', access.module.group_id)
      .select('id, vocabulary')
      .maybeSingle();

    if (error) {
      console.error('Failed to save lesson vocabulary', {
        error,
        moduleId: resolved.moduleId,
        vocabularyCount: parsed.vocabulary.length,
      });
      return NextResponse.json(
        { message: 'Failed to save lesson vocabulary' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { message: 'Module not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      vocabulary:
        (data as { vocabulary?: VocabularyEntry[] }).vocabulary ??
        parsed.vocabulary,
    });
  });
}

export const PATCH = updateVocabulary;
export const PUT = updateVocabulary;
