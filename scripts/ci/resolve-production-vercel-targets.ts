import { appendFileSync } from 'node:fs';
import {
  cloudflareProductionTargets,
  getWorkflowDecision,
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
  packageResume?: boolean;
  expectedSha?: string;
  rootDir: string;
  targets?: readonly { productionWorkflow: string }[];
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
      '## Production deployment plan: Vercel and Cloudflare',
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
  packageResume = false,
  expectedSha,
  rootDir,
  targets = [...vercelWorkflowTargets, ...cloudflareProductionTargets],
  workspaceManifests = readWorkspaceManifests(rootDir),
}: ResolveProductionTargetsInput): Promise<ProductionTargetDecision[]> {
  // Only exact-production package recovery keeps commit-driven selection.
  // Ordinary operator dispatch still intentionally selects every enabled app.
  if (
    packageResume &&
    (eventName !== 'workflow_dispatch' ||
      refName !== 'production' ||
      !/^[a-f0-9]{40}$/.test(expectedSha ?? '') ||
      expectedSha !== headSha)
  ) {
    throw new Error(
      'Package recovery requires the exact production dispatch SHA'
    );
  }
  const selectionEvent = packageResume ? 'push' : eventName;
  return Promise.all(
    targets.map(async ({ productionWorkflow }) => {
      const changeResult = await resolveChangedFiles({
        eventName: selectionEvent,
        headSha,
        refName,
        rootDir,
        workflowName: productionWorkflow,
      });
      // An exact deployment marker is positive coverage evidence, not an
      // unavailable empty changed-file list. Ordinary dispatch semantics stay intact.
      if (
        packageResume &&
        changeResult.available &&
        changeResult.source === 'deployment-marker' &&
        changeResult.baseSha === headSha
      ) {
        return {
          changeResult,
          matchedPaths: [],
          reason:
            'successful deployment marker already covers the recovery SHA',
          shouldRun: false,
          workflowName: productionWorkflow,
        };
      }
      const decision = getWorkflowDecision({
        changedFiles: changeResult.available ? changeResult.files : null,
        eventName: selectionEvent,
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
  const resumeIndex = process.argv.indexOf('--package-resume');
  const expectedShaIndex = process.argv.indexOf('--expected-sha');
  const decisions = await resolveProductionVercelTargets({
    packageResume: resumeIndex >= 0 && process.argv[resumeIndex + 1] === 'true',
    expectedSha:
      expectedShaIndex >= 0 ? process.argv[expectedShaIndex + 1] : undefined,
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
