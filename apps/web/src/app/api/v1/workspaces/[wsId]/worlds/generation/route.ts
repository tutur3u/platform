import { enforceAiDataConsent } from '@tuturuuu/ai/chat/ai-data-consent';
import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { generationLimits } from '@tuturuuu/worlds/generation';
import { z } from 'zod';
import { worldsProviderLimits } from '@/lib/worlds/generation/adapter';
import { generateWorldDraft } from '@/lib/worlds/generation/runtime';

type Context = { params: Promise<{ wsId: string }> };

const requestSchema = z
  .object({
    requestId: z.uuid().toLowerCase(),
    worldId: z.uuid().toLowerCase(),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(generationLimits.instructionLength),
    attachment: z
      .object({
        mediaType: z.enum([
          'image/png',
          'text/plain',
          'text/markdown',
          'text/csv',
          'application/json',
        ]),
        data: z
          .string()
          .min(4)
          .max(Math.ceil(worldsProviderLimits.imageBytes / 3) * 4),
      })
      .optional(),
  })
  .strict();

const maxBodyBytes =
  Math.ceil(worldsProviderLimits.imageBytes / 3) * 4 + 32_768;

function json(result: { status: string }, status: number) {
  return Response.json(result, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function readInput(request: Request) {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim() !==
    'application/json'
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0;
    let text = '';
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) return null;
      text += decoder.decode(value, { stream: true });
    }
    signal.throwIfAborted();
    const parsed = requestSchema.safeParse(JSON.parse(text + decoder.decode()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    signal.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { user } = await resolveAuthenticatedSessionUser(
      await createClient(request)
    );
    if (!user) return json({ status: 'forbidden' }, 403);
    const permissions = await getPermissions({
      wsId: (await params).wsId,
      user,
    });
    if (!permissions?.containsPermission('manage_workspace_settings'))
      return json({ status: 'forbidden' }, 403);
    // Drafts send the instruction and attachment to Gemini.
    const consentRefusal = await enforceAiDataConsent(request, user.id);
    if (consentRefusal) return consentRefusal;

    const input = await readInput(request);
    if (!input) return json({ status: 'invalid' }, 400);
    const scope = {
      workspaceId: permissions.wsId,
      actorId: user.id,
      worldId: input.worldId,
    };
    const key = {
      workspaceId: scope.workspaceId,
      worldId: scope.worldId,
      requestId: input.requestId,
      instruction: input.instruction,
    };

    // Upload bytes belong to this authorized request and have no reusable URL or storage key.
    const attachment = input.attachment;
    const bytes = attachment
      ? Buffer.from(attachment.data, 'base64')
      : undefined;
    if (attachment && bytes?.toString('base64') !== attachment.data)
      return json({ status: 'invalid' }, 400);
    const result =
      attachment && bytes
        ? await generateWorldDraft(
            scope,
            {
              ...key,
              kind: attachment.mediaType === 'image/png' ? 'image' : 'file',
              source: {
                id: key.requestId,
                mediaType: attachment.mediaType,
                byteLength: bytes.byteLength,
              },
            },
            request.signal,
            bytes
          )
        : await generateWorldDraft(
            scope,
            { ...key, kind: 'prompt' },
            request.signal
          );

    const status = {
      ok: 200,
      invalid: 400,
      'invalid-output': 422,
      'credits-unavailable': 402,
      unavailable: 503,
    };
    return json(result, status[result.status]);
  } catch (error) {
    if (error instanceof AiStudioError) {
      if (error.status === 409) return json({ status: 'duplicate' }, 409);
      if (error.status === 402)
        return json({ status: 'credits-unavailable' }, 402);
      if (error.status === 429) return json({ status: 'rate-limited' }, 429);
    }
    return json({ status: 'unavailable' }, 503);
  }
}
