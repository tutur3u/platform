import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Ledger } from './ledger';
import { readRunConfig, type RunConfig, type Suite } from './policy';
import type { QaUser, TuturuuuQaClient } from './tuturuuu-qa';
import type { UpskiiIdentity, UpskiiProvisioner } from './upskii';

/**
 * Run actors, provisioned once in global setup. Passwords live only in a
 * 0600 file beside the ledger inside the runner's temp directory and are
 * removed in global teardown; they are never logged or uploaded.
 */
export interface Actors {
  runLabel: string;
  tuturuuu?: {
    runId: string;
    workspaceId: string;
    host: QaUser;
    learner: QaUser;
    decliner: QaUser;
    outsider: QaUser;
  };
  upskii?: {
    teacher: UpskiiIdentity;
    student: UpskiiIdentity;
    outsider: UpskiiIdentity;
  };
}

export function actorsPath(config: RunConfig) {
  return join(dirname(config.ledgerPath), 'actors.json');
}

const needsTuturuuu = (suites: Suite[]) => suites.includes('meet-flow');

export async function provisionActors(
  config: RunConfig,
  ledger: Ledger,
  clients: { tuturuuu: TuturuuuQaClient; upskii: UpskiiProvisioner }
): Promise<Actors> {
  const actors: Actors = { runLabel: config.runLabel };
  const upskii: Partial<NonNullable<Actors['upskii']>> = {};
  for (const role of ['teacher', 'student', 'outsider'] as const) {
    const key = `upskii-identity:${config.runLabel}:${role}`;
    ledger.register({
      key,
      kind: 'upskii-identity',
      suite: 'run',
      actor: 'operator',
    });
    const identity = await clients.upskii.create(config.runLabel, role);
    ledger.register({
      key,
      kind: 'upskii-identity',
      suite: 'run',
      actor: 'operator',
      id: identity.userId,
    });
    upskii[role] = identity;
  }
  actors.upskii = upskii as NonNullable<Actors['upskii']>;

  if (needsTuturuuu(config.suites)) {
    const key = `tuturuuu-qa-run:${config.runLabel}`;
    ledger.register({
      key,
      kind: 'tuturuuu-qa-run',
      suite: 'meet-flow',
      actor: 'operator',
    });
    const hostRun = await clients.tuturuuu.createRun({ staff: true });
    ledger.register({
      key,
      kind: 'tuturuuu-qa-run',
      suite: 'meet-flow',
      actor: 'operator',
      id: hostRun.runId,
    });
    const rest = await clients.tuturuuu.createRun({
      staff: false,
      runId: hostRun.runId,
      count: 2,
    });
    // Every account in a run joins its workspace, so the non-member outsider
    // gets a run of its own without a workspace.
    const outsiderKey = `tuturuuu-qa-run:${config.runLabel}:outsider`;
    ledger.register({
      key: outsiderKey,
      kind: 'tuturuuu-qa-run',
      suite: 'meet-flow',
      actor: 'operator',
    });
    const outsiderRun = await clients.tuturuuu.createRun({
      staff: false,
      workspace: false,
    });
    ledger.register({
      key: outsiderKey,
      kind: 'tuturuuu-qa-run',
      suite: 'meet-flow',
      actor: 'operator',
      id: outsiderRun.runId,
    });
    const [host] = hostRun.users;
    const [learner, decliner] = rest.users;
    const [outsider] = outsiderRun.users;
    if (!host || !learner || !decliner || !outsider || !hostRun.runWorkspaceId)
      throw new Error('Tuturuuu QA run is incomplete');
    actors.tuturuuu = {
      runId: hostRun.runId,
      workspaceId: hostRun.runWorkspaceId,
      host,
      learner,
      decliner,
      outsider,
    };
  }
  writeFileSync(actorsPath(config), JSON.stringify(actors), { mode: 0o600 });
  return actors;
}

export function loadActors(): Actors {
  const config = readRunConfig(process.env);
  const path = actorsPath(config);
  if (!existsSync(path)) throw new Error('Run actors were not provisioned');
  return JSON.parse(readFileSync(path, 'utf8')) as Actors;
}

export function forgetActors(config: RunConfig) {
  rmSync(actorsPath(config), { force: true });
}
