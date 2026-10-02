import { createPOST } from '@tuturuuu/ai/chat/google/route';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { chatGPTErrorResponse } from '@/lib/chatgpt/errors';
import {
  CHATGPT_USAGE_ERROR,
  resolveChatGPTModel,
} from '@/lib/chatgpt/provider';
import { chatGPTEnabled } from '@/lib/chatgpt/storage';

const handler = createPOST({
  requireWorkspaceId: true,
  resolveAuth: async (request) => {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    return user
      ? { ok: true, supabase, user }
      : {
          ok: false,
          response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
        };
  },
  subscription: {
    resolveModel: resolveChatGPTModel,
    errorResponse: chatGPTErrorResponse,
    onError: () => CHATGPT_USAGE_ERROR,
  },
});

export async function POST(request: Parameters<typeof handler>[0]) {
  if (!chatGPTEnabled())
    return Response.json(
      { error: 'ChatGPT plan usage is unavailable on this installation' },
      { status: 404 }
    );
  return handler(request);
}
