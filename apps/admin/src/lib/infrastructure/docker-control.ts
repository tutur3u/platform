import 'server-only';

import type {
  CronRunnerRecoveryAction,
  CronRunnerRecoveryRequest,
} from '@tuturuuu/internal-api/infrastructure/monitoring';

type DockerControlRecoveryResponse = {
  message?: string;
  recovery?: unknown;
};

export type DockerControlRecoveryResult =
  | {
      configured: false;
      ok: false;
      reason: 'not_configured';
    }
  | {
      configured: true;
      ok: false;
      reason: 'request_failed';
      status: number | null;
      message: string;
    }
  | {
      configured: true;
      ok: true;
      message: string;
      recovery: unknown;
      request: CronRunnerRecoveryRequest;
    };

function normalizeDockerControlUrl(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;

  try {
    return new URL(normalized);
  } catch {
    return null;
  }
}

function getDockerControlConfig() {
  const url = normalizeDockerControlUrl(
    process.env.PLATFORM_DOCKER_CONTROL_URL
  );
  const token = process.env.PLATFORM_DOCKER_CONTROL_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { token, url };
}

function recoveryReason(action: CronRunnerRecoveryAction, reason?: string) {
  return (
    reason?.trim() ||
    (action === 'restart'
      ? 'operator-requested-restart'
      : 'operator-requested-ensure')
  );
}

export async function requestDockerControlCronRunnerRecovery({
  action,
  fetchImpl = fetch,
  reason,
  requestedBy,
  requestedByEmail,
}: {
  action: CronRunnerRecoveryAction;
  fetchImpl?: typeof fetch;
  reason?: string;
  requestedBy: string;
  requestedByEmail: string | null;
}): Promise<DockerControlRecoveryResult> {
  const config = getDockerControlConfig();
  if (!config) {
    return {
      configured: false,
      ok: false,
      reason: 'not_configured',
    };
  }

  const url = new URL('/v1/cron/recovery', config.url);
  const requestedAt = new Date().toISOString();

  let response: Response;
  try {
    response = await fetchImpl(url, {
      body: JSON.stringify({
        action,
        reason: recoveryReason(action, reason),
      }),
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
  } catch (error) {
    return {
      configured: true,
      message: error instanceof Error ? error.message : String(error),
      ok: false,
      reason: 'request_failed',
      status: null,
    };
  }

  const payload = (await response
    .json()
    .catch(() => ({}))) as DockerControlRecoveryResponse;

  if (!response.ok) {
    return {
      configured: true,
      message:
        typeof payload.message === 'string'
          ? payload.message
          : `Docker control returned HTTP ${response.status}`,
      ok: false,
      reason: 'request_failed',
      status: response.status,
    };
  }

  return {
    configured: true,
    message:
      typeof payload.message === 'string'
        ? payload.message
        : action === 'restart'
          ? 'Restarted cron runner service.'
          : 'Ensured watcher and cron runner services are serving.',
    ok: true,
    recovery: payload.recovery ?? null,
    request: {
      action,
      attemptCount: 1,
      kind: 'cron-runner-recovery',
      lastAttemptAt: Date.now(),
      lastError: null,
      reason: recoveryReason(action, reason),
      requestedAt,
      requestedBy,
      requestedByEmail,
    },
  };
}
