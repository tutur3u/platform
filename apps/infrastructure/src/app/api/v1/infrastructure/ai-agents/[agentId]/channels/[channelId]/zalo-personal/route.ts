import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAiAgentZaloPersonalStatus,
  startAiAgentZaloPersonalListener,
  stopAiAgentZaloPersonalListener,
  syncAiAgentZaloPersonalHistory,
  syncAiAgentZaloPersonalPhoneHistory,
  validateAiAgentZaloPersonalChannel,
} from '@/lib/ai-agents/zalo-personal-listeners';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';
import { requireAiAgentAdmin } from '../../../../access';

interface Params {
  params: Promise<{
    agentId: string;
    channelId: string;
  }>;
}

const actionSchema = z.object({
  action: z.enum(['start', 'stop', 'sync-history', 'sync-phone', 'validate']),
});

type PhoneSyncInput = Parameters<typeof syncAiAgentZaloPersonalPhoneHistory>[0];
type PhoneSyncResult = Awaited<
  ReturnType<typeof syncAiAgentZaloPersonalPhoneHistory>
>;
type PhoneSyncJobSnapshot = {
  completedAt: string | null;
  error: string | null;
  startedAt: string;
  status: 'completed' | 'failed' | 'running';
  sync: PhoneSyncResult['sync'] | null;
};
type PhoneSyncJobRecord = {
  promise: Promise<void>;
  snapshot: PhoneSyncJobSnapshot;
};

type GlobalWithZaloPersonalPhoneSyncJobs = typeof globalThis & {
  __tuturuuuAiAgentZaloPersonalPhoneSyncJobs?: Map<string, PhoneSyncJobRecord>;
};

const PHONE_SYNC_JOB_TIMEOUT_ERROR = 'zalo_personal_phone_sync_timed_out';
const PHONE_SYNC_JOB_TIMEOUT_MS = 2 * 60 * 1000;
const PHONE_SYNC_JOB_TTL_MS = 10 * 60 * 1000;
const phoneSyncJobs = getPhoneSyncJobs();

function getPhoneSyncJobs() {
  const scope = globalThis as GlobalWithZaloPersonalPhoneSyncJobs;

  scope.__tuturuuuAiAgentZaloPersonalPhoneSyncJobs ??= new Map();

  return scope.__tuturuuuAiAgentZaloPersonalPhoneSyncJobs;
}

function phoneSyncJobKey(agentId: string, channelId: string) {
  return `${agentId}:${channelId}`;
}

function startPhoneSyncJob(input: PhoneSyncInput) {
  const key = phoneSyncJobKey(input.agentId, input.channelId);
  const existingJob = phoneSyncJobs.get(key);

  if (existingJob?.snapshot.status === 'running') {
    return existingJob;
  }

  const snapshot: PhoneSyncJobSnapshot = {
    completedAt: null,
    error: null,
    startedAt: new Date().toISOString(),
    status: 'running',
    sync: null,
  };
  const job: PhoneSyncJobRecord = {
    promise: withPhoneSyncTimeout(syncAiAgentZaloPersonalPhoneHistory(input))
      .then((result) => {
        snapshot.completedAt = new Date().toISOString();
        snapshot.status = 'completed';
        snapshot.sync = result.sync;

        console.info('Personal Zalo phone sync background job completed', {
          agentId: input.agentId,
          channelId: input.channelId,
          status: result.sync.status,
          approvalRequested: result.sync.approvalRequested,
          requestAccepted: result.sync.requestAccepted,
          requestHttpError: result.sync.requestHttpError,
          requestViaHttp: result.sync.requestViaHttp,
          requestViaWebSocket: result.sync.requestViaWebSocket,
          pullAttempts: result.sync.pullAttempts,
          error: result.sync.error,
          synced: result.sync.synced,
          threads: result.sync.threads,
        });
      })
      .catch((error) => {
        snapshot.completedAt = new Date().toISOString();
        snapshot.error = error instanceof Error ? error.message : String(error);
        snapshot.status = 'failed';

        console.warn('Personal Zalo phone sync background job failed', {
          agentId: input.agentId,
          channelId: input.channelId,
          error: snapshot.error,
        });
      })
      .finally(() => {
        schedulePhoneSyncJobCleanup(key, snapshot);
      }),
    snapshot,
  };

  phoneSyncJobs.set(key, job);

  return job;
}

async function withPhoneSyncTimeout<T>(task: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      task,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(PHONE_SYNC_JOB_TIMEOUT_ERROR)),
          PHONE_SYNC_JOB_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function getPhoneSyncJobSnapshot(agentId: string, channelId: string) {
  return (
    phoneSyncJobs.get(phoneSyncJobKey(agentId, channelId))?.snapshot ?? null
  );
}

function schedulePhoneSyncJobCleanup(
  key: string,
  snapshot: PhoneSyncJobSnapshot
) {
  const timer = setTimeout(() => {
    if (phoneSyncJobs.get(key)?.snapshot === snapshot) {
      phoneSyncJobs.delete(key);
    }
  }, PHONE_SYNC_JOB_TTL_MS);

  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }
}

async function getStatus(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;

  try {
    const status = await getAiAgentZaloPersonalStatus({
      agentId,
      channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    });

    return NextResponse.json({
      phoneSyncJob: getPhoneSyncJobSnapshot(agentId, channelId),
      status,
    });
  } catch (error) {
    console.warn('Failed to get personal Zalo AI agent status', {
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to get personal Zalo AI agent status' },
      { status: 400 }
    );
  }
}

async function runAction(request: NextRequest, { params }: Params) {
  const access = await requireAiAgentAdmin(request);

  if (!access.ok) {
    return access.response;
  }

  const { agentId, channelId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid personal Zalo action payload' },
      { status: 400 }
    );
  }

  try {
    const input = {
      agentId,
      channelId,
      db: access.sbAdmin,
      origin: request.nextUrl.origin,
    };
    if (parsed.data.action === 'sync-history') {
      return NextResponse.json(await syncAiAgentZaloPersonalHistory(input));
    }

    if (parsed.data.action === 'sync-phone') {
      const status = await getAiAgentZaloPersonalStatus(input);

      if (!status.enabled) {
        return NextResponse.json(
          { error: 'Personal Zalo AI agent actions are disabled' },
          { status: 400 }
        );
      }

      const phoneSyncJob = startPhoneSyncJob(input);

      return NextResponse.json({
        phoneSyncJob: phoneSyncJob.snapshot,
        status: {
          ...status,
          lastError: 'zalo_personal_phone_sync_waiting_for_phone',
          lastEventAt: new Date().toISOString(),
        },
        sync: {
          approvalRequested: false,
          cleaned: false,
          error: null,
          groupMessages: 0,
          pullAttempts: 0,
          requestAccepted: false,
          requestHttpError: null,
          requestViaHttp: false,
          requestViaWebSocket: false,
          status: 'waiting_for_phone',
          synced: 0,
          threads: 0,
          userMessages: 0,
        },
      });
    }

    const status =
      parsed.data.action === 'validate'
        ? await validateAiAgentZaloPersonalChannel(input)
        : parsed.data.action === 'start'
          ? await startAiAgentZaloPersonalListener(input)
          : await stopAiAgentZaloPersonalListener(input);

    return NextResponse.json({ status });
  } catch (error) {
    console.warn('Failed to run personal Zalo AI agent action', {
      action: parsed.data.action,
      agentId,
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to run personal Zalo AI agent action' },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal',
    },
    () => getStatus(request, context)
  );
}

export async function POST(request: NextRequest, context: Params) {
  return withRequestLogDrain(
    {
      request,
      route:
        '/api/v1/infrastructure/ai-agents/[agentId]/channels/[channelId]/zalo-personal',
    },
    () => runAction(request, context)
  );
}
