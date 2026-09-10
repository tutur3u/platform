import type { DurableObjectNamespace } from '@cloudflare/workers-types';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { z } from 'zod';
import { MeetCallAccessError } from '@/features/call/lib/call-access';
import {
  callRoomService,
  roomRoute,
} from '@/features/call/server/room-service';
import { readLiveRequestBody } from '@/features/live-assistant/request-body';
import { liveWorkspaceTools } from '@/features/live-assistant/workspace-tools';

export async function POST(
  request: Request,
  context: { params: Promise<{ meetingId: string }> }
) {
  const { meetingId } = await context.params;
  return roomRoute(request, meetingId, async (access) => {
    const body = await readLiveRequestBody(request, 2000);
    const parsed = z
      .object({
        sessionId: z.uuid(),
        reviewId: z.uuid(),
        approved: z.boolean(),
      })
      .safeParse(body.ok ? body.data : null);
    if (!parsed.success) throw new MeetCallAccessError(400, 'Invalid review');
    const { env } = await getCloudflareContext({ async: true });
    const binding = (env as unknown as { MEET_LIVE: DurableObjectNamespace })
      .MEET_LIVE;
    const object = binding.get(binding.idFromName(parsed.data.sessionId));
    const command = (action: string, extra = {}) =>
      object.fetch('https://live.internal/workspace-review', {
        method: 'POST',
        body: JSON.stringify({
          action,
          ownerId: access.user.id,
          meetingId,
          reviewId: parsed.data.reviewId,
          ...extra,
        }),
      });
    if (parsed.data.approved)
      await callRoomService(access, { action: 'live.context' });
    const claim = await command(parsed.data.approved ? 'claim' : 'deny');
    if (!claim.ok)
      throw new MeetCallAccessError(claim.status, 'Review unavailable');
    if (!parsed.data.approved) return { ok: true };
    const input = (await claim.json()) as {
      workspaceId: string;
      timezone: string;
      toolName: string;
      args: unknown;
    };
    let result: string;
    let failed = false;
    try {
      // Recheck membership and permissions at execution time, never trust a cached catalog.
      const tools = await liveWorkspaceTools(
        access,
        input.workspaceId,
        input.timezone
      );
      const tool = tools[input.toolName];
      if (!tool?.execute || !(tool.inputSchema instanceof z.ZodType))
        throw new Error('Tool unavailable');
      const args = tool.inputSchema.parse(input.args);
      const execute = tool.execute as unknown as (
        args: unknown,
        options: { toolCallId: string; messages: never[] }
      ) => Promise<unknown>;
      const output = await execute(args, {
        toolCallId: parsed.data.reviewId,
        messages: [],
      });
      result = JSON.stringify(output).slice(0, 48000);
    } catch {
      failed = true;
      result =
        'Operation failed or its outcome is unknown. Do not retry automatically or claim success.';
    }
    const finished = await command('finish', { result, failed });
    if (!finished.ok)
      throw new MeetCallAccessError(
        409,
        'Action may have completed; check its outcome before trying again'
      );
    return { ok: !failed };
  });
}
