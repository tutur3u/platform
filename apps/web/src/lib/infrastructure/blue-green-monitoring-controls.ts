import fs from 'node:fs';
import path from 'node:path';

type FsLike = Pick<
  typeof fs,
  'existsSync' | 'mkdirSync' | 'readFileSync' | 'rmSync' | 'writeFileSync'
>;

const DOCKER_WEB_CONTROL_ENV_KEY = 'PLATFORM_BLUE_GREEN_CONTROL_DIR';
const INSTANT_ROLLOUT_REQUEST_FILE = 'blue-green-instant-rollout.request.json';
const DEPLOYMENT_PIN_FILE = 'blue-green-deployment-pin.json';

export interface BlueGreenInstantRolloutRequest {
  kind: 'sync-standby';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
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
