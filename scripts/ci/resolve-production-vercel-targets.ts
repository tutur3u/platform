import { appendFileSync } from 'node:fs';
import {
  getWorkflowDecision,
  type VercelWorkflowTarget,
  vercelWorkflowTargets,
  type WorkspaceManifest,
} from '../../tuturuuu.ts';
import {
  type ChangedFilesResult,
  resolveChangedFiles,
} from './resolve-changed-files-core.ts';
import { readWorkspaceManifests } from './workflow-config-core.ts';

type ProductionTargetDecision = {
  changeResult: ChangedFilesResult;
  matchedPaths: string[];
  reason: string;
  shouldRun: boolean;
  workflowName: string;
};

type ResolveProductionTargetsInput = {
  eventName?: string;
  headSha?: string;
  refName?: string;
  rootDir: string;
  targets?: readonly VercelWorkflowTarget[];
  workspaceManifests?: WorkspaceManifest[];
};

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

function appendStepSummary(
  decisions: ProductionTargetDecision[],
  summaryPath?: string
) {
  if (!summaryPath) {
    return;
  }

  const rows = decisions.map(
    ({ changeResult, reason, shouldRun, workflowName }) =>
      `| \`${workflowName}\` | ${shouldRun ? 'Deploy' : 'Skip'} | ${changeResult.source} | ${reason.replaceAll('|', '\\|')} |`
  );

  appendFileSync(
    summaryPath,
    [
      '## Production Vercel deployment plan',
      '',
      '| Workflow | Decision | Baseline | Reason |',
      '| --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n')
  );
}

export async function resolveProductionVercelTargets({
  eventName = process.env.GITHUB_EVENT_NAME,
  headSha = process.env.GITHUB_SHA,
  refName = process.env.GITHUB_REF_NAME,
  rootDir,
  targets = vercelWorkflowTargets,
  workspaceManifests = readWorkspaceManifests(rootDir),
}: ResolveProductionTargetsInput): Promise<ProductionTargetDecision[]> {
  return Promise.all(
    targets.map(async ({ productionWorkflow }) => {
      const changeResult = await resolveChangedFiles({
        eventName,
        headSha,
        refName,
        rootDir,
        workflowName: productionWorkflow,
      });
      const decision = getWorkflowDecision({
        changedFiles: changeResult.available ? changeResult.files : null,
        eventName,
        workflowName: productionWorkflow,
        workspaceManifests,
      });

      return {
        changeResult,
        ...decision,
        workflowName: productionWorkflow,
      };
    })
  );
}

async function main() {
  const summaryPathIndex = process.argv.indexOf('--step-summary');
  const summaryPath =
    summaryPathIndex >= 0 ? process.argv[summaryPathIndex + 1] : undefined;
  const decisions = await resolveProductionVercelTargets({
    rootDir: process.cwd(),
  });
  const workflows = decisions
    .filter(({ shouldRun }) => shouldRun)
    .map(({ workflowName }) => workflowName);

  for (const decision of decisions) {
    console.log(
      `${decision.shouldRun ? 'select' : 'skip'} ${decision.workflowName}: ${decision.reason} (${decision.changeResult.source})`
    );
  }

  console.log(`Selected ${workflows.length} production workflow(s).`);
  appendGithubOutput({
    workflow_count: String(workflows.length),
    workflows_json: JSON.stringify(workflows),
  });
  appendStepSummary(decisions, summaryPath);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
