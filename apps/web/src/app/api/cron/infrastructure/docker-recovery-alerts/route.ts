import os from 'node:os';
import { sendSystemEmail } from '@tuturuuu/email-service';
import type {
  BlueGreenDockerRecoverySettings,
  BlueGreenMonitoringWatcherLog,
} from '@tuturuuu/internal-api/infrastructure';
import { type NextRequest, NextResponse } from 'next/server';
import { readBlueGreenMonitoringSnapshot } from '@/lib/infrastructure/blue-green-monitoring';
import {
  readBlueGreenDockerRecoveryAlertState,
  writeBlueGreenDockerRecoveryAlertState,
} from '@/lib/infrastructure/blue-green-monitoring-controls';
import { serverLogger, withCronLogDrain } from '@/lib/infrastructure/log-drain';

const JOB_ID = 'infrastructure-docker-recovery-alerts';
const PATH = '/api/cron/infrastructure/docker-recovery-alerts';
const DEFAULT_LOOKBACK_MS = 15 * 60_000;

interface DockerRecoveryIncident {
  id: string;
  logs: BlueGreenMonitoringWatcherLog[];
  summary: BlueGreenMonitoringWatcherLog;
}

export async function GET(request: NextRequest) {
  return withCronLogDrain({ jobId: JOB_ID, path: PATH, request }, () =>
    handleGET(request)
  );
}

function parseEmailList(value: string | null | undefined) {
  return [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    ),
  ];
}

function resolveAlertRecipients(settings: BlueGreenDockerRecoverySettings) {
  if (settings.emailAlertRecipients.length > 0) {
    return settings.emailAlertRecipients;
  }

  const envRecipients = parseEmailList(
    process.env.PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS
  );
  if (envRecipients.length > 0) {
    return envRecipients;
  }

  return settings.updatedByEmail ? [settings.updatedByEmail] : [];
}

function isDockerRecoveryLog(log: BlueGreenMonitoringWatcherLog) {
  if (
    log.eventType === 'docker-daemon-unavailable' ||
    log.eventType === 'docker-daemon-recovered' ||
    log.eventType === 'docker-daemon-recovery-timeout'
  ) {
    return true;
  }

  return /Docker daemon (became unavailable|recovered|did not recover)/iu.test(
    log.message
  );
}

function getIncidentId(log: BlueGreenMonitoringWatcherLog) {
  return (
    log.incidentId ??
    log.eventId ??
    `legacy-docker-${log.time}-${log.message.slice(0, 80)}`
  );
}

function getIncidentSummary(logs: BlueGreenMonitoringWatcherLog[]) {
  return (
    logs.find((log) => log.eventType === 'docker-daemon-recovery-timeout') ??
    logs.find((log) => log.eventType === 'docker-daemon-recovered') ??
    logs.find((log) => log.eventType === 'docker-daemon-unavailable') ??
    logs[0] ??
    null
  );
}

export function findPendingDockerRecoveryIncidents({
  logs,
  minimumTime,
  notifiedIncidentIds,
}: {
  logs: BlueGreenMonitoringWatcherLog[];
  minimumTime: number;
  notifiedIncidentIds: string[];
}) {
  const notified = new Set(notifiedIncidentIds);
  const grouped = new Map<string, BlueGreenMonitoringWatcherLog[]>();

  for (const log of logs) {
    if (!isDockerRecoveryLog(log) || log.time < minimumTime) {
      continue;
    }

    const incidentId = getIncidentId(log);
    if (notified.has(incidentId)) {
      continue;
    }

    grouped.set(incidentId, [...(grouped.get(incidentId) ?? []), log]);
  }

  return [...grouped.entries()]
    .flatMap(([id, incidentLogs]): DockerRecoveryIncident[] => {
      const summary = getIncidentSummary(incidentLogs);

      return summary ? [{ id, logs: incidentLogs, summary }] : [];
    })
    .sort((left, right) => left.summary.time - right.summary.time);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatIncidentStatus(incident: DockerRecoveryIncident) {
  if (
    incident.logs.some((log) => log.eventType === 'docker-daemon-recovered')
  ) {
    return 'recovered';
  }

  if (
    incident.logs.some(
      (log) => log.eventType === 'docker-daemon-recovery-timeout'
    )
  ) {
    return 'recovery timed out';
  }

  return 'unavailable';
}

function createEmailContent(incidents: DockerRecoveryIncident[]) {
  const hostname = os.hostname();
  const latestIncident = incidents[incidents.length - 1];
  const status = latestIncident
    ? formatIncidentStatus(latestIncident)
    : 'unavailable';
  const subject = `[Tuturuuu] Docker ${status} on ${hostname}`;
  const incidentItems = incidents
    .map((incident) => {
      const lines = incident.logs
        .toSorted((left, right) => left.time - right.time)
        .map(
          (log) =>
            `<li><strong>${escapeHtml(new Date(log.time).toISOString())}</strong> ${escapeHtml(
              log.message
            )}</li>`
        )
        .join('');

      return `<h2>Incident ${escapeHtml(incident.id)}</h2><p>Status: ${escapeHtml(
        formatIncidentStatus(incident)
      )}</p><ul>${lines}</ul>`;
    })
    .join('');
  const html = `<p>The Tuturuuu infrastructure monitor detected Docker daemon recovery activity on <strong>${escapeHtml(
    hostname
  )}</strong>.</p>${incidentItems}<p>Open Infrastructure Monitoring for container health, watcher logs, and recovery settings.</p>`;
  const text = `The Tuturuuu infrastructure monitor detected Docker daemon recovery activity on ${hostname}.\n\n${incidents
    .map((incident) =>
      [
        `Incident ${incident.id}`,
        `Status: ${formatIncidentStatus(incident)}`,
        ...incident.logs
          .toSorted((left, right) => left.time - right.time)
          .map((log) => `${new Date(log.time).toISOString()} ${log.message}`),
      ].join('\n')
    )
    .join('\n\n')}`;

  return { html, subject, text };
}

async function handleGET(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const snapshot = readBlueGreenMonitoringSnapshot({ watcherLogLimit: 500 });
    const settings = snapshot.control.dockerRecoverySettings;
    const envRecipients = parseEmailList(
      process.env.PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS
    );
    const alertsEnabled =
      settings.emailAlertsEnabled || envRecipients.length > 0;

    if (!alertsEnabled) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'disabled' });
    }

    const recipients = resolveAlertRecipients(settings);
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'no-recipients' });
    }

    const state = readBlueGreenDockerRecoveryAlertState();
    const now = Date.now();
    const lastCheckedAtMs = state.lastCheckedAt
      ? Date.parse(state.lastCheckedAt)
      : Number.NaN;
    const minimumTime = Number.isFinite(lastCheckedAtMs)
      ? lastCheckedAtMs
      : now - DEFAULT_LOOKBACK_MS;
    const incidents = findPendingDockerRecoveryIncidents({
      logs: snapshot.watcher.logs,
      minimumTime,
      notifiedIncidentIds: state.notifiedIncidentIds,
    });

    if (incidents.length === 0) {
      writeBlueGreenDockerRecoveryAlertState({
        ...state,
        lastCheckedAt: new Date(now).toISOString(),
      });

      return NextResponse.json({ ok: true, sent: 0, skipped: 'no-incidents' });
    }

    const lastSentAtMs = state.lastSentAt ? Date.parse(state.lastSentAt) : 0;
    if (
      Number.isFinite(lastSentAtMs) &&
      lastSentAtMs > 0 &&
      now - lastSentAtMs < settings.emailAlertCooldownMs
    ) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'cooldown' });
    }

    const emailContent = createEmailContent(incidents);
    const result = await sendSystemEmail({
      recipients: { to: recipients },
      content: emailContent,
      source: {
        name: 'Tuturuuu',
        email: 'notifications@tuturuuu.com',
      },
      metadata: {
        entityId: incidents.map((incident) => incident.id).join(','),
        entityType: 'docker-recovery-incident',
        templateType: 'infrastructure-docker-recovery-alert',
      },
    });

    if (!result.success) {
      serverLogger.error('Failed to send Docker recovery alert email', {
        error: result.error,
        incidentIds: incidents.map((incident) => incident.id),
        recipients,
      });
      return NextResponse.json(
        { ok: false, error: result.error ?? 'Failed to send alert email' },
        { status: 500 }
      );
    }

    const nextState = writeBlueGreenDockerRecoveryAlertState({
      ...state,
      lastCheckedAt: new Date(now).toISOString(),
      lastSentAt: new Date(now).toISOString(),
      notifiedIncidentIds: [
        ...incidents.map((incident) => incident.id),
        ...state.notifiedIncidentIds,
      ],
    });

    serverLogger.warn('Sent Docker recovery alert email', {
      incidentIds: incidents.map((incident) => incident.id),
      recipients,
    });

    return NextResponse.json({
      ok: true,
      notifiedIncidentIds: nextState.notifiedIncidentIds,
      sent: incidents.length,
    });
  } catch (error) {
    serverLogger.error('Failed to process Docker recovery alerts', error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process Docker recovery alerts',
      },
      { status: 500 }
    );
  }
}
