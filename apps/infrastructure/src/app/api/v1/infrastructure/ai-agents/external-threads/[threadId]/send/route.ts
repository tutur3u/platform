import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendAiAgentExternalResponse } from '@/lib/ai-agents/external-chat-actions';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../access';

type RouteParams = {
  threadId: string;
};

const sendSchema = z.object({
  content: z.string().trim().min(1).max(10000),
});

async function sendResponse(request: NextRequest, params: RouteParams) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Manual response content is required' },
      { status: 400 }
    );
  }

  try {
    const message = await sendAiAgentExternalResponse({
      actorUserId: access.user.id,
      content: parsed.data.content,
      origin: request.nextUrl.origin,
      threadId: params.threadId,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('Failed to send AI agent external response', error);
    return NextResponse.json(
      { error: 'Failed to send external response' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  const resolvedParams = await params;

  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/external-threads/[threadId]/send',
    },
    () => sendResponse(request, resolvedParams)
  );
}
