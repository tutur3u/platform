import fs from 'node:fs';
import path from 'node:path';

type FsLike = Pick<
  typeof fs,
  'existsSync' | 'mkdirSync' | 'readFileSync' | 'rmSync' | 'writeFileSync'
>;

const DOCKER_WEB_CONTROL_ENV_KEY = 'PLATFORM_BLUE_GREEN_CONTROL_DIR';
const INSTANT_ROLLOUT_REQUEST_FILE = 'blue-green-instant-rollout.request.json';
const DEPLOYMENT_PIN_FILE = 'blue-green-deployment-pin.json';
const WATCHER_RECOVERY_REQUEST_FILE =
  'blue-green-watcher-recovery.request.json';
const DOCKER_RECOVERY_SETTINGS_FILE =
  'blue-green-docker-recovery-settings.json';
const DOCKER_RECOVERY_ALERT_STATE_FILE =
  'blue-green-docker-recovery-alert-state.json';
const DEFAULT_DOCKER_RECOVERY_POLL_MS = 5_000;
const DEFAULT_DOCKER_RECOVERY_TIMEOUT_MS: number | null = null;
const DEFAULT_DOCKER_RESTART_AFTER_MS: number | null = 30_000;
const DEFAULT_DOCKER_RESTART_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_DOCKER_POST_RESTART_COMMAND_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_DOCKER_EMAIL_ALERT_COOLDOWN_MS = 30 * 60_000;

export interface BlueGreenInstantRolloutRequest {
  kind: 'sync-standby';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

export interface BlueGreenWatcherRecoveryRequest {
  kind: 'watcher-recovery';
  projectBranch: string | null;
  projectId: string;
  reason: string;
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
  watcherBranch: string | null;
  watcherHealth: string | null;
}

export interface BlueGreenDockerRecoveryCommand {
  args: string[];
  command: string;
  cwd: string | null;
}

export interface BlueGreenDockerRecoverySettings {
  dockerRecoveryPollMs: number;
  dockerRecoveryTimeoutMs: number | null;
  dockerRestartAfterMs: number | null;
  dockerRestartCommand: string[] | null;
  dockerRestartCooldownMs: number;
  dockerRestartDisabled: boolean;
  emailAlertCooldownMs: number;
  emailAlertRecipients: string[];
  emailAlertsEnabled: boolean;
  kind: 'docker-recovery-settings';
  postRestartCommandTimeoutMs: number;
  postRestartCommands: BlueGreenDockerRecoveryCommand[];
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByEmail: string | null;
}

export interface BlueGreenDockerRecoveryAlertState {
  kind: 'docker-recovery-alert-state';
  lastCheckedAt: string | null;
  lastSentAt: string | null;
  notifiedIncidentIds: string[];
  updatedAt: string | null;
}

export interface BlueGreenDeploymentPin {
  activeColor: string | null;
  commitHash: string;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentStamp: string | null;
  kind: 'deployment-pin';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

function resolveMonitoringControlDir(fsImpl: FsLike = fs) {
  const configuredDir = process.env[DOCKER_WEB_CONTROL_ENV_KEY]?.trim();
  const candidates = [
    configuredDir,
    path.resolve(process.cwd(), 'tmp', 'docker-web', 'watch', 'control'),
    path.resolve(process.cwd(), '..', 'tmp', 'docker-web', 'watch', 'control'),
    path.resolve(
      process.cwd(),
      '..',
      '..',
      'tmp',
      'docker-web',
      'watch',
      'control'
    ),
  ].filter((value): value is string => Boolean(value));

  const existing = candidates.find((candidate) => fsImpl.existsSync(candidate));

  return {
    exists: Boolean(existing),
    path:
      existing ??
      candidates[0] ??
      path.resolve('tmp', 'docker-web', 'watch', 'control'),
  };
}

function toPositiveInteger(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function toNullablePositiveInteger(value: unknown, fallback: number | null) {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return fallback;
}

function normalizeEmailList(value: unknown) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();
  const emails: string[] = [];

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

function getDefaultDockerRecoverySettings(): BlueGreenDockerRecoverySettings {
  return {
    dockerRecoveryPollMs: DEFAULT_DOCKER_RECOVERY_POLL_MS,
    dockerRecoveryTimeoutMs: DEFAULT_DOCKER_RECOVERY_TIMEOUT_MS,
    dockerRestartAfterMs: DEFAULT_DOCKER_RESTART_AFTER_MS,
    dockerRestartCommand: null,
    dockerRestartCooldownMs: DEFAULT_DOCKER_RESTART_COOLDOWN_MS,
    dockerRestartDisabled: false,
    emailAlertCooldownMs: DEFAULT_DOCKER_EMAIL_ALERT_COOLDOWN_MS,
    emailAlertRecipients: [],
    emailAlertsEnabled: false,
    kind: 'docker-recovery-settings',
    postRestartCommandTimeoutMs: DEFAULT_DOCKER_POST_RESTART_COMMAND_TIMEOUT_MS,
    postRestartCommands: [],
    updatedAt: null,
    updatedBy: null,
    updatedByEmail: null,
  };
}

export function normalizeBlueGreenDockerRecoverySettings(
  value: unknown
): BlueGreenDockerRecoverySettings {
  const defaults = getDefaultDockerRecoverySettings();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const record = value as Record<string, unknown>;

  return {
    dockerRecoveryPollMs: toPositiveInteger(
      record.dockerRecoveryPollMs,
      defaults.dockerRecoveryPollMs
    ),
    dockerRecoveryTimeoutMs: toNullablePositiveInteger(
      record.dockerRecoveryTimeoutMs,
      defaults.dockerRecoveryTimeoutMs
    ),
    dockerRestartAfterMs: toNullablePositiveInteger(
      record.dockerRestartAfterMs,
      defaults.dockerRestartAfterMs
    ),
    dockerRestartCommand: null,
    dockerRestartCooldownMs: toPositiveInteger(
      record.dockerRestartCooldownMs,
      defaults.dockerRestartCooldownMs
    ),
    dockerRestartDisabled:
      typeof record.dockerRestartDisabled === 'boolean'
        ? record.dockerRestartDisabled
        : defaults.dockerRestartDisabled,
    emailAlertCooldownMs: toPositiveInteger(
      record.emailAlertCooldownMs,
      defaults.emailAlertCooldownMs
    ),
    emailAlertRecipients: normalizeEmailList(record.emailAlertRecipients),
    emailAlertsEnabled:
      typeof record.emailAlertsEnabled === 'boolean'
        ? record.emailAlertsEnabled
        : defaults.emailAlertsEnabled,
    kind: 'docker-recovery-settings',
    postRestartCommandTimeoutMs: toPositiveInteger(
      record.postRestartCommandTimeoutMs,
      defaults.postRestartCommandTimeoutMs
    ),
    postRestartCommands: [],
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    updatedBy: typeof record.updatedBy === 'string' ? record.updatedBy : null,
    updatedByEmail:
      typeof record.updatedByEmail === 'string' ? record.updatedByEmail : null,
  };
}

export function queueBlueGreenInstantRolloutRequest(
  {
    requestedAt = new Date().toISOString(),
    requestedBy,
    requestedByEmail,
  }: {
    requestedAt?: string;
    requestedBy: string;
    requestedByEmail: string | null;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const request: BlueGreenInstantRolloutRequest = {
    kind: 'sync-standby',
    requestedAt,
    requestedBy,
    requestedByEmail,
  };

  fsImpl.mkdirSync(controlDir.path, { recursive: true });
  fsImpl.writeFileSync(
    path.join(controlDir.path, INSTANT_ROLLOUT_REQUEST_FILE),
    JSON.stringify(request, null, 2),
    'utf8'
  );

  return request;
}

export function readBlueGreenInstantRolloutRequest({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const filePath = path.join(controlDir.path, INSTANT_ROLLOUT_REQUEST_FILE);

  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.kind === 'sync-standby' &&
      typeof parsed.requestedAt === 'string' &&
      typeof parsed.requestedBy === 'string'
    ) {
      return parsed as BlueGreenInstantRolloutRequest;
    }
  } catch {
    return null;
  }

  return null;
}

export function writeBlueGreenDeploymentPin(
  {
    activeColor = null,
    commitHash,
    commitShortHash = null,
    commitSubject = null,
    deploymentStamp = null,
    requestedAt = new Date().toISOString(),
    requestedBy,
    requestedByEmail,
  }: Omit<BlueGreenDeploymentPin, 'kind' | 'requestedAt'> & {
    requestedAt?: string;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const request: BlueGreenDeploymentPin = {
    activeColor,
    commitHash,
    commitShortHash,
    commitSubject,
    deploymentStamp,
    kind: 'deployment-pin',
    requestedAt,
    requestedBy,
    requestedByEmail,
  };

  fsImpl.mkdirSync(controlDir.path, { recursive: true });
  fsImpl.writeFileSync(
    path.join(controlDir.path, DEPLOYMENT_PIN_FILE),
    JSON.stringify(request, null, 2),
    'utf8'
  );

  return request;
}

export function clearBlueGreenDeploymentPin({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  fsImpl.rmSync(path.join(controlDir.path, DEPLOYMENT_PIN_FILE), {
    force: true,
  });
}

export function readBlueGreenDeploymentPin({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const filePath = path.join(controlDir.path, DEPLOYMENT_PIN_FILE);

  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.kind === 'deployment-pin' &&
      typeof parsed.commitHash === 'string' &&
      typeof parsed.requestedAt === 'string' &&
      typeof parsed.requestedBy === 'string'
    ) {
      return parsed as BlueGreenDeploymentPin;
    }
  } catch {
    return null;
  }

  return null;
}

export function queueBlueGreenWatcherRecoveryRequest(
  {
    projectBranch = null,
    projectId,
    reason,
    requestedAt = new Date().toISOString(),
    requestedBy,
    requestedByEmail,
    watcherBranch = null,
    watcherHealth = null,
  }: Omit<BlueGreenWatcherRecoveryRequest, 'kind' | 'requestedAt'> & {
    requestedAt?: string;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const request: BlueGreenWatcherRecoveryRequest = {
    kind: 'watcher-recovery',
    projectBranch,
    projectId,
    reason,
    requestedAt,
    requestedBy,
    requestedByEmail,
    watcherBranch,
    watcherHealth,
  };

  fsImpl.mkdirSync(controlDir.path, { recursive: true });
  fsImpl.writeFileSync(
    path.join(controlDir.path, WATCHER_RECOVERY_REQUEST_FILE),
    JSON.stringify(request, null, 2),
    'utf8'
  );

  return request;
}

export function readBlueGreenWatcherRecoveryRequest({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const filePath = path.join(controlDir.path, WATCHER_RECOVERY_REQUEST_FILE);

  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.kind === 'watcher-recovery' &&
      typeof parsed.projectId === 'string' &&
      typeof parsed.reason === 'string' &&
      typeof parsed.requestedAt === 'string' &&
      typeof parsed.requestedBy === 'string'
    ) {
      return parsed as BlueGreenWatcherRecoveryRequest;
    }
  } catch {
    return null;
  }

  return null;
}

export function readBlueGreenDockerRecoverySettings({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const filePath = path.join(controlDir.path, DOCKER_RECOVERY_SETTINGS_FILE);

  if (!fsImpl.existsSync(filePath)) {
    return getDefaultDockerRecoverySettings();
  }

  try {
    return normalizeBlueGreenDockerRecoverySettings(
      JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
    );
  } catch {
    return getDefaultDockerRecoverySettings();
  }
}

export function writeBlueGreenDockerRecoverySettings(
  settings: Omit<
    BlueGreenDockerRecoverySettings,
    'kind' | 'updatedAt' | 'updatedBy' | 'updatedByEmail'
  > & {
    updatedAt?: string | null;
    updatedBy: string;
    updatedByEmail: string | null;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const nextSettings = normalizeBlueGreenDockerRecoverySettings({
    ...settings,
    kind: 'docker-recovery-settings',
    updatedAt: settings.updatedAt ?? new Date().toISOString(),
    updatedBy: settings.updatedBy,
    updatedByEmail: settings.updatedByEmail,
  });

  fsImpl.mkdirSync(controlDir.path, { recursive: true });
  fsImpl.writeFileSync(
    path.join(controlDir.path, DOCKER_RECOVERY_SETTINGS_FILE),
    JSON.stringify(nextSettings, null, 2),
    'utf8'
  );

  return nextSettings;
}

function normalizeBlueGreenDockerRecoveryAlertState(
  value: unknown
): BlueGreenDockerRecoveryAlertState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      kind: 'docker-recovery-alert-state',
      lastCheckedAt: null,
      lastSentAt: null,
      notifiedIncidentIds: [],
      updatedAt: null,
    };
  }

  const record = value as Record<string, unknown>;
  const notifiedIncidentIds = Array.isArray(record.notifiedIncidentIds)
    ? record.notifiedIncidentIds.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0
      )
    : [];

  return {
    kind: 'docker-recovery-alert-state',
    lastCheckedAt:
      typeof record.lastCheckedAt === 'string' ? record.lastCheckedAt : null,
    lastSentAt:
      typeof record.lastSentAt === 'string' ? record.lastSentAt : null,
    notifiedIncidentIds: [...new Set(notifiedIncidentIds)].slice(0, 500),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
  };
}

export function readBlueGreenDockerRecoveryAlertState({
  fsImpl = fs,
}: {
  fsImpl?: FsLike;
} = {}) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const filePath = path.join(controlDir.path, DOCKER_RECOVERY_ALERT_STATE_FILE);

  if (!fsImpl.existsSync(filePath)) {
    return normalizeBlueGreenDockerRecoveryAlertState(null);
  }

  try {
    return normalizeBlueGreenDockerRecoveryAlertState(
      JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
    );
  } catch {
    return normalizeBlueGreenDockerRecoveryAlertState(null);
  }
}

export function writeBlueGreenDockerRecoveryAlertState(
  state: Omit<BlueGreenDockerRecoveryAlertState, 'kind' | 'updatedAt'> & {
    updatedAt?: string | null;
  },
  { fsImpl = fs }: { fsImpl?: FsLike } = {}
) {
  const controlDir = resolveMonitoringControlDir(fsImpl);
  const nextState = normalizeBlueGreenDockerRecoveryAlertState({
    ...state,
    kind: 'docker-recovery-alert-state',
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  });

  fsImpl.mkdirSync(controlDir.path, { recursive: true });
  fsImpl.writeFileSync(
    path.join(controlDir.path, DOCKER_RECOVERY_ALERT_STATE_FILE),
    JSON.stringify(nextState, null, 2),
    'utf8'
  );

  return nextState;
}
