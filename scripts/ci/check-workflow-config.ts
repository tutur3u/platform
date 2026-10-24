import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { getWorkflowDecision } from '../../tuturuuu.ts';
import { lockfileWorkspaceDelta } from './lockfile-workspace-delta.ts';
import { getMailCalendarTasksAffected } from './mail-calendar-tasks-affected.ts';
import {
  readWorkspaceManifests,
  splitChangedFiles,
} from './workflow-config-core.ts';

type ParsedArgs = {
  changedFiles?: string;
  changedFilesFile?: string;
  eventName?: string;
  rootDir: string;
  workflowName?: string;
};

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    rootDir: process.cwd(),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--changed-files' && next) {
      parsed.changedFiles = next;
      index += 1;
      continue;
    }

    if (arg === '--changed-files-file' && next) {
      parsed.changedFilesFile = next;
      index += 1;
      continue;
    }

    if (arg === '--event-name' && next) {
      parsed.eventName = next;
      index += 1;
      continue;
    }

    if (arg === '--root-dir' && next) {
      parsed.rootDir = next;
      index += 1;
      continue;
    }

    if (arg === '--workflow' && next) {
      parsed.workflowName = next;
      index += 1;
    }
  }

  return parsed;
}

function readChangedFiles(args: ParsedArgs): string[] | null {
  const changedFilesFile =
    args.changedFilesFile ?? process.env.CHANGED_FILES_FILE;

  if (changedFilesFile) {
    if (!existsSync(changedFilesFile)) {
      console.warn(`Changed-file input ${changedFilesFile} does not exist.`);
      return null;
    }

    return splitChangedFiles(readFileSync(changedFilesFile, 'utf8'));
  }

  const changedFiles = args.changedFiles ?? process.env.CHANGED_FILES;

  return changedFiles ? splitChangedFiles(changedFiles) : null;
}

const SHA = /^[0-9a-f]{40}$/;

// Narrow a bun.lock change to the workspaces whose resolution changed. Any
// missing commit, read failure or shared resolution returns null (global).
function readLockfileWorkspaces(
  changedFiles: string[] | null,
  rootDir: string,
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: ci-check step input, outside Turbo.
  baseSha = process.env.CHANGED_BASE_SHA,
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: ci-check step input, outside Turbo.
  headSha = process.env.CHANGED_HEAD_SHA
): string[] | null {
  if (!changedFiles?.includes('bun.lock')) return null;
  if (!baseSha || !headSha || !SHA.test(baseSha) || !SHA.test(headSha))
    return null;
  try {
    const show = (sha: string) =>
      execFileSync('git', ['show', `${sha}:bun.lock`], {
        cwd: rootDir,
        encoding: 'utf8',
        maxBuffer: 128 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 60_000,
      });
    const delta = lockfileWorkspaceDelta(show(baseSha), show(headSha));
    if (delta.global) {
      console.log(`bun.lock relevance: global (${delta.reason})`);
      return null;
    }
    console.log(
      `bun.lock relevance: ${delta.workspaces.join(', ') || 'no workspace resolution changed'}`
    );
    return delta.workspaces;
  } catch {
    console.log(
      'bun.lock relevance: global (base or head lockfile unavailable)'
    );
    return null;
  }
}

function appendGithubOutput(output: Record<string, string>) {
  const githubOutput = process.env.GITHUB_OUTPUT;

  if (!githubOutput) {
    return;
  }

  appendFileSync(
    githubOutput,
    `${Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
}

function main(args = process.argv.slice(2)) {
  const parsedArgs = parseArgs(args);
  const workflowName = parsedArgs.workflowName ?? process.env.WORKFLOW_NAME;

  if (!workflowName) {
    console.error('Missing workflow name. Pass --workflow or WORKFLOW_NAME.');
    process.exitCode = 1;
    return;
  }

  const changedFiles = readChangedFiles(parsedArgs);
  const workspaceManifests = readWorkspaceManifests(parsedArgs.rootDir);
  const decision = getWorkflowDecision({
    changedFiles,
    eventName: parsedArgs.eventName ?? process.env.GITHUB_EVENT_NAME,
    lockfileWorkspaces: readLockfileWorkspaces(
      changedFiles,
      parsedArgs.rootDir
    ),
    workflowName,
    workspaceManifests,
  });

  console.log(`Workflow: ${workflowName}`);
  console.log(`Should run: ${String(decision.shouldRun)}`);
  console.log(`Reason: ${decision.reason}`);

  if (decision.matchedPaths.length > 0) {
    console.log('Matched paths:');
    for (const matchedPath of decision.matchedPaths) {
      console.log(`- ${matchedPath}`);
    }
  }

  const affectedJobs =
    workflowName === 'mail-calendar-tasks-builds.yaml'
      ? getMailCalendarTasksAffected({
          changedFiles,
          eventName: parsedArgs.eventName ?? process.env.GITHUB_EVENT_NAME,
          workspaceManifests,
        })
      : {};

  appendGithubOutput({
    affected_jobs: JSON.stringify(affectedJobs),
    reason: decision.reason,
    should_run: String(decision.shouldRun),
  });
}

main();
