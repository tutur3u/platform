import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  abortAiAgentZaloPersonalQrLogin,
  getAiAgentZaloPersonalQrLoginStatus,
  startAiAgentZaloPersonalQrLogin,
} from '@/lib/ai-agents/zalo-personal-qr-login';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../../../access';

interface Params {
  params: Promise<{
    agentId: string;
    channelId: string;
  }>;
}

const sessionQuerySchema = z.object({
  sessionId: z.string().min(1),
});

async function startQrLogin(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;

  try {
    const session = await startAiAgentZaloPersonalQrLogin({
      agentId,
      channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.warn('Failed to start personal Zalo QR login', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to start personal Zalo QR login' },
      { status: 400 }
    );
  }
}

async function getQrLoginStatus(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;
  const parsed = sessionQuerySchema.safeParse({
    sessionId: request.nextUrl.searchParams.get('sessionId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid personal Zalo QR session query' },
      { status: 400 }
    );
  }

  try {
    const session = await getAiAgentZaloPersonalQrLoginStatus({
      agentId,
      channelId,
      sessionId: parsed.data.sessionId,
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.warn('Failed to get personal Zalo QR login status', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
      sessionId: parsed.data.sessionId,
    });
    return NextResponse.json(
      { error: 'Failed to get personal Zalo QR login status' },
      { status: 404 }
    );
  }
}

async function abortQrLogin(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;
  const parsed = sessionQuerySchema.safeParse({
    sessionId: request.nextUrl.searchParams.get('sessionId'),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid personal Zalo QR session query' },
      { status: 400 }
    );
  }

  try {
    const session = await abortAiAgentZaloPersonalQrLogin({
      agentId,
      channelId,
      sessionId: parsed.data.sessionId,
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.warn('Failed to abort personal Zalo QR login', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
      sessionId: parsed.data.sessionId,
    });
    return NextResponse.json(
      { error: 'Failed to abort personal Zalo QR login' },
      { status: 404 }
    );
  }
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal/qr-login',
    },
    () => startQrLogin(request, context)
  );
}

export async function GET(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal/qr-login',
    },
    () => getQrLoginStatus(request, context)
  );
}

export async function DELETE(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal/qr-login',
    },
    () => abortQrLogin(request, context)
  );
}
