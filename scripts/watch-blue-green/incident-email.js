const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const BUILD_FAILURE_ALERT_RECIPIENTS_ENV =
  'PLATFORM_DOCKER_RECOVERY_ALERT_EMAILS';
const DOCKER_RECOVERY_SETTINGS_FILE =
  'blue-green-docker-recovery-settings.json';
const SYSTEM_EMAIL_SOURCE = {
  email: 'notifications@tuturuuu.com',
  name: 'Tuturuuu',
};

function parseEmailList(value) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set();
  const emails = [];

  for (const entry of entries) {
    if (typeof entry !== 'string') {
      continue;
    }

    const email = entry.trim().toLowerCase();
    if (
      !email ||
      seen.has(email) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
    ) {
      continue;
    }

    seen.add(email);
    emails.push(email);
  }

  return emails;
}

function readBuildFailureAlertSettings({ fsImpl = fs, paths } = {}) {
  const filePath = paths?.controlDir
    ? path.join(paths.controlDir, DOCKER_RECOVERY_SETTINGS_FILE)
    : null;

  if (!filePath || !fsImpl?.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function resolveBuildFailureAlertRecipients({ env = process.env, settings }) {
  const configuredRecipients = parseEmailList(settings?.emailAlertRecipients);
  if (configuredRecipients.length > 0) {
    return configuredRecipients;
  }

  const envRecipients = parseEmailList(
    env?.[BUILD_FAILURE_ALERT_RECIPIENTS_ENV]
  );
  if (envRecipients.length > 0) {
    return envRecipients;
  }

  return parseEmailList(settings?.updatedByEmail);
}

function areBuildFailureAlertsEnabled({ env = process.env, settings }) {
  return (
    settings?.emailAlertsEnabled === true ||
    parseEmailList(env?.[BUILD_FAILURE_ALERT_RECIPIENTS_ENV]).length > 0
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : 'unknown';
}

function formatDurationMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'unknown';
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

function truncateText(value, maxLength) {
  const text = String(value ?? '').trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getDeploymentKind(entry) {
  return String(entry?.deploymentKind ?? 'promotion').trim() || 'promotion';
}

function getShortCommit(entry) {
  return (
    entry?.commitShortHash ??
    (typeof entry?.commitHash === 'string'
      ? entry.commitHash.slice(0, 12)
      : 'unknown')
  );
}

function getTargetBranch(target) {
  return typeof target?.branch === 'string' && target.branch.trim()
    ? target.branch.trim()
    : 'unknown';
}

function getTargetUpstream(target) {
  return typeof target?.upstreamRef === 'string' && target.upstreamRef.trim()
    ? target.upstreamRef.trim()
    : 'unknown';
}

function createDebugCommands({ entry }) {
  const commitHash = entry?.commitHash || '<commit>';

  return [
    `git show --stat --oneline ${commitHash}`,
    `git log -1 --format=fuller ${commitHash}`,
    'docker compose -f docker-compose.web.prod.yml logs --tail=250 web-blue-green-watcher',
    'tail -n 200 tmp/docker-web/watch/blue-green-auto-deploy.logs.json',
    'cat tmp/docker-web/watch/blue-green-auto-deploy.history.json',
    'git status --short --branch',
  ].filter(Boolean);
}

function createBuildFailureIncidentEmail({
  entry,
  hostname = os.hostname(),
  paths,
  target,
} = {}) {
  const shortHash = getShortCommit(entry);
  const deploymentKind = getDeploymentKind(entry);
  const commitSubject = entry?.commitSubject || 'Unknown commit subject';
  const commitMessage = entry?.commitMessage || entry?.message || null;
  const commitHash = entry?.commitHash || 'unknown';
  const failureReason = truncateText(
    entry?.failureReason ||
      entry?.errorMessage ||
      'No failure reason recorded.',
    2000
  );
  const startedAt = formatTimestamp(entry?.startedAt);
  const finishedAt = formatTimestamp(entry?.finishedAt);
  const duration = formatDurationMs(entry?.buildDurationMs);
  const debugCommands = createDebugCommands({ entry });
  const details = [
    ['Host', hostname],
    ['Deployment kind', deploymentKind],
    ['Branch', getTargetBranch(target)],
    ['Upstream', getTargetUpstream(target)],
    ['Commit', commitHash],
    ['Short commit', shortHash],
    ['Subject', commitSubject],
    ['Message', commitMessage],
    ['Started at', startedAt],
    ['Finished at', finishedAt],
    ['Duration', duration],
    ['Exit code', entry?.exitCode ?? null],
    ['Signal', entry?.signal ?? null],
    ['History file', paths?.historyFile ?? null],
    ['Watcher log file', paths?.logFile ?? null],
  ].filter(([, value]) => value != null && value !== '');
  const subject = `[Tuturuuu] apps/web blue/green build failed for ${shortHash}`;
  const text = [
    `apps/web blue/green build failed for ${shortHash}.`,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    'Failure reason:',
    failureReason,
    '',
    'Useful debugging commands:',
    ...debugCommands.map((command) => `- ${command}`),
  ].join('\n');
  const detailsHtml = details
    .map(
      ([label, value]) =>
        `<tr><th align="left">${escapeHtml(label)}</th><td><code>${escapeHtml(
          value
        )}</code></td></tr>`
    )
    .join('');
  const commandsHtml = debugCommands
    .map((command) => `<li><code>${escapeHtml(command)}</code></li>`)
    .join('');
  const html = [
    `<p>The apps/web blue/green watcher recorded a failed build or deployment for <strong>${escapeHtml(
      shortHash
    )}</strong>.</p>`,
    `<table>${detailsHtml}</table>`,
    '<h2>Failure reason</h2>',
    `<pre>${escapeHtml(failureReason)}</pre>`,
    '<h2>Useful debugging commands</h2>',
    `<ul>${commandsHtml}</ul>`,
  ].join('');

  return {
    html,
    subject,
    text,
  };
}

async function resolveSendSystemEmail({ importEmailService, sendSystemEmail }) {
  if (typeof sendSystemEmail === 'function') {
    return sendSystemEmail;
  }

  const importer =
    importEmailService ??
    (() => {
      return import('@tuturuuu/email-service');
    });
  const emailService = await importer();

  return emailService.sendSystemEmail;
}

async function sendBuildFailureIncidentEmail({
  entry,
  env = process.env,
  fsImpl = fs,
  hostname = os.hostname(),
  importEmailService,
  paths,
  sendSystemEmail,
  target,
} = {}) {
  const settings = readBuildFailureAlertSettings({ fsImpl, paths });
  const enabled = areBuildFailureAlertsEnabled({ env, settings });

  if (!enabled) {
    return { sent: false, skipped: 'disabled' };
  }

  const recipients = resolveBuildFailureAlertRecipients({ env, settings });
  if (recipients.length === 0) {
    return { sent: false, skipped: 'no-recipients' };
  }

  const sender = await resolveSendSystemEmail({
    importEmailService,
    sendSystemEmail,
  });
  const content = createBuildFailureIncidentEmail({
    entry,
    hostname,
    paths,
    target,
  });
  const result = await sender({
    content,
    metadata: {
      entityId: entry?.commitHash ?? getShortCommit(entry),
      entityType: 'blue-green-deployment',
      templateType: 'infrastructure-blue-green-build-failure',
    },
    recipients: { to: recipients },
    source: SYSTEM_EMAIL_SOURCE,
  });

  if (!result?.success) {
    return {
      error: result?.error ?? 'Failed to send build failure incident email',
      recipients,
      sent: false,
      skipped: 'send-failed',
    };
  }

  return { recipients, sent: true };
}

module.exports = {
  BUILD_FAILURE_ALERT_RECIPIENTS_ENV,
  DOCKER_RECOVERY_SETTINGS_FILE,
  areBuildFailureAlertsEnabled,
  createBuildFailureIncidentEmail,
  parseEmailList,
  readBuildFailureAlertSettings,
  resolveBuildFailureAlertRecipients,
  sendBuildFailureIncidentEmail,
};
