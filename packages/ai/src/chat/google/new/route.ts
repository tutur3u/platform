import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import {
  cascadeBackendRateLimitToProxyBan,
  isBackendRateLimitError,
} from '@tuturuuu/utils/abuse-protection/backend-rate-limit';
import { validateAiTempAuthRequest } from '@tuturuuu/utils/ai-temp-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeStableModelId } from '../../../credits/model-mapping';
import {
  authorizeAiWorkspace,
  isInternalTuturuuuAiUser,
  resolveSupabaseSessionUser,
} from '../route-auth';

// Preserve the default model stored for callers that omit a model.
const DEFAULT_CHAT_MODEL = 'gemini-3.1-flash-lite';
const NewChatIdSchema = z.string().trim().pipe(z.uuid());
const NewChatBodySchema = z.object({
  id: NewChatIdSchema.optional(),
  isMiraMode: z.boolean().optional(),
  message: z.string().optional(),
  model: z.string().optional(),
  wsId: z.string().optional(),
});

async function buildRateLimitResponse(
  req: Request,
  {
    source,
  }: {
    source: 'auth' | 'database';
  }
) {
  const ipAddress = extractIPFromHeaders(req.headers);
  const blockInfo = await cascadeBackendRateLimitToProxyBan({
    endpoint: new URL(req.url).pathname,
    ipAddress,
    source,
  });
  const retryAfter = blockInfo
    ? Math.max(
        1,
        Math.ceil((blockInfo.expiresAt.getTime() - Date.now()) / 1000)
      )
    : 60;

  return NextResponse.json(
    { error: 'Too Many Requests', message: 'Rate limit exceeded' },
    {
      status: 429,
      headers: {
        'Retry-After': `${retryAfter}`,
      },
    }
  );
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return 'Internal server error.';
}

type GatewayAuthenticatedClient = {
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
};

type GatewayAuthResolution =
  | {
      auth: GatewayAuthenticatedClient;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    }
  | null;

type CreatePostOptions = {
  /** Resolves gateway-level JWT auth without making @tuturuuu/ai depend on auth. */
  resolveGatewayAuth?: (request: Request) => Promise<GatewayAuthResolution>;
  /** Gateway provider prefix for bare model names. Defaults to 'google'. */
  defaultProvider?: string;
  requireWorkspaceId?: boolean;
};

type ChatMessageInsertMode = 'direct' | 'rpc';

type AuthenticatedContext = GatewayAuthenticatedClient & {
  messageInsertMode: ChatMessageInsertMode;
};

export function createPOST(options: CreatePostOptions = {}) {
  return async function handler(req: Request) {
    try {
      const requestBody = NewChatBodySchema.safeParse(await req.json());
      if (!requestBody.success) {
        const invalidId = requestBody.error.issues.some(
          (issue) => issue.path[0] === 'id'
        );
        return NextResponse.json(
          invalidId ? 'Invalid chat id' : 'Invalid request body',
          { status: 400 }
        );
      }
      const { id, isMiraMode, message, model, wsId } = requestBody.data;

      if (!message)
        return NextResponse.json('No message provided', { status: 400 });

      const tempAuth = await validateAiTempAuthRequest(req);
      if (tempAuth.status === 'revoked') {
        return NextResponse.json('Unauthorized', { status: 401 });
      }

      let auth: AuthenticatedContext | null = null;

      if (tempAuth.status === 'valid') {
        const supabase = (await createClient(req)) as TypedSupabaseClient;
        auth = {
          messageInsertMode: 'rpc',
          supabase,
          user: tempAuth.context.user as SupabaseUser,
        };
      } else {
        const gatewayAuth = await options.resolveGatewayAuth?.(req);

        if (gatewayAuth?.ok === false) {
          return gatewayAuth.response;
        }

        if (gatewayAuth?.ok) {
          auth = {
            messageInsertMode: 'direct',
            ...gatewayAuth.auth,
          };
        }
      }

      if (!auth) {
        const supabase = (await createClient(req)) as TypedSupabaseClient;

        const { user: sessionUser, authError } =
          await resolveSupabaseSessionUser(supabase);

        if (isBackendRateLimitError(authError)) {
          return buildRateLimitResponse(req, { source: 'auth' });
        }

        if (sessionUser) {
          auth = {
            messageInsertMode: 'rpc',
            supabase,
            user: sessionUser,
          };
        }
      }

      if (!auth) return NextResponse.json('Unauthorized', { status: 401 });

      const { messageInsertMode, supabase, user } = auth;

      if (!wsId && options.requireWorkspaceId) {
        return NextResponse.json(
          { error: 'Invalid workspace identifier' },
          { status: 422 }
        );
      }

      if (isMiraMode) {
        const allowed = await isInternalTuturuuuAiUser({
          ok: true,
          supabase,
          user,
          ...(tempAuth.status === 'valid'
            ? { tempAuthContext: tempAuth.context }
            : {}),
        });
        if (!allowed) {
          return NextResponse.json(
            { error: 'Mira mode is limited to @tuturuuu.com accounts' },
            { status: 403 }
          );
        }
      }

      if (wsId) {
        const workspaceAuthorization = await authorizeAiWorkspace({
          request: req,
          supabase,
          userId: user.id,
          wsId,
        });
        if (!workspaceAuthorization.ok) {
          return workspaceAuthorization.response;
        }
      }

      const title = provisionalTitle(message);

      // Store bare model name for DB compatibility (ai_models FK)
      const resolvedModel = model
        ? normalizeStableModelId(
            model.includes('/') ? model.split('/').pop()! : model
          ).toLowerCase()
        : DEFAULT_CHAT_MODEL;

      const { data: chat, error: chatError } = await supabase
        .from('ai_chats')
        .insert({
          id,
          title,
          creator_id: user.id,
          model: resolvedModel,
        })
        .select('id')
        .single();

      if (chatError) {
        if (isBackendRateLimitError(chatError)) {
          return buildRateLimitResponse(req, {
            source: 'database',
          });
        }

        console.log(chatError);
        return NextResponse.json(getErrorMessage(chatError), { status: 500 });
      }

      const source = isMiraMode ? 'Mira' : 'Rewise';
      const { error: msgError } =
        messageInsertMode === 'direct'
          ? await supabase.from('ai_chat_messages').insert({
              chat_id: chat.id,
              content: message,
              creator_id: user.id,
              role: 'USER',
              metadata: { source },
            })
          : await supabase.rpc('insert_ai_chat_message', {
              message: message,
              chat_id: chat.id,
              source,
            });

      if (msgError) {
        if (isBackendRateLimitError(msgError)) {
          return buildRateLimitResponse(req, {
            source: 'database',
          });
        }

        console.log(msgError);
        return NextResponse.json(getErrorMessage(msgError), { status: 500 });
      }

      return NextResponse.json({ id: chat.id, title }, { status: 200 });
    } catch (error: unknown) {
      console.log(error);
      return NextResponse.json(
        {
          message: `## Edge API Failure\nCould not complete the request. Please view the **Stack trace** below.\n\`\`\`bash\n${error instanceof Error ? error.stack : 'Unknown error'}`,
        },
        {
          status: 500,
        }
      );
    }
  };
}

// Segment graphemes so truncation preserves emoji and combining diacritics.
function provisionalTitle(message: string): string {
  const normalized = message.trim().replace(/\s+/gu, ' ');
  if (!normalized) return '…';

  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes: string[] = [];
  for (const { segment } of segments.segment(normalized)) {
    graphemes.push(segment);
    if (graphemes.length > 60) break;
  }
  if (graphemes.length <= 60) return normalized;

  const prefix = graphemes.slice(0, 59).join('');
  const boundary = prefix.lastIndexOf(' ');
  const shortened =
    graphemes[59] !== ' ' && boundary > 0 ? prefix.slice(0, boundary) : prefix;
  return `${shortened.trimEnd()}…`;
}
