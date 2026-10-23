import { createHash } from 'node:crypto';
import { dockerMetadata } from './devbox-docker-metadata';

export const JUDGE_CONTAINER_LABEL = 'dev.tuturuuu.devbox.judge';
export const JUDGE_OWNER_LABEL = 'dev.tuturuuu.devbox.judge-owner';
const MAX_ORPHAN_REMOVALS = 100;
const CONTAINER_ID = /^[a-f0-9]{12,64}$/u;

let containerOwner = 'unowned';

// A runner-token hash identifies this runner's Judge containers across agent
// restarts without exposing the token; other runners on the host keep theirs.
export function judgeContainerOwner(token: string) {
  return createHash('sha256').update(token).digest('hex').slice(0, 24);
}

export function setJudgeContainerOwner(owner: string) {
  containerOwner = owner;
}

export function judgeContainerLabelArgs(owner = containerOwner) {
  return [
    `--label=${JUDGE_CONTAINER_LABEL}=1`,
    `--label=${JUDGE_OWNER_LABEL}=${owner}`,
  ];
}

// Called once at agent startup, before any Judge job can start: every
// container still carrying this runner's label was left behind by a previous
// process (watchdog exit, SIGKILL, crash) and would otherwise keep burning
// the sandbox budget. Bounded to one list and one removal call.
export async function removeOrphanedJudgeContainers(
  owner = containerOwner,
  dockerHost?: string
) {
  const listed = await dockerMetadata(
    [
      'ps',
      '--all',
      '--quiet',
      '--no-trunc',
      '--filter',
      `label=${JUDGE_CONTAINER_LABEL}=1`,
      '--filter',
      `label=${JUDGE_OWNER_LABEL}=${owner}`,
    ],
    10_000,
    dockerHost
  );
  if (listed.code !== 0) return 0;
  const ids = [
    ...new Set(
      listed.output.split(/\s+/u).filter((id) => CONTAINER_ID.test(id))
    ),
  ].slice(0, MAX_ORPHAN_REMOVALS);
  if (ids.length === 0) return 0;
  const removed = await dockerMetadata(
    ['rm', '--force', ...ids],
    30_000,
    dockerHost
  );
  return removed.code === 0 ? ids.length : 0;
}

export async function prepareJudgeContainers(
  token: string,
  env: NodeJS.ProcessEnv = process.env
) {
  setJudgeContainerOwner(judgeContainerOwner(token));
  // Playground pool processes share the runner token but never run Judge, so
  // they must not remove the Judge process's live containers.
  if (env.TUTURUUU_PLAYGROUND_POOL_ID || !env.TUTURUUU_JUDGE_IMAGES?.trim()) {
    return 0;
  }
  const removed = await removeOrphanedJudgeContainers();
  if (removed > 0) {
    console.warn(`Removed ${removed} orphaned Judge container(s).`);
  }
  return removed;
}
