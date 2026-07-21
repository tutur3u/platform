import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { getWorkflowDecision } from '../../tuturuuu.ts';
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

  appendGithubOutput({
    reason: decision.reason,
    should_run: String(decision.shouldRun),
  });
}

main();
