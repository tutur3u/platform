export const ci = {
  'biome-check.yaml': true,
  'branch-name-check.yaml': true,
  'check-and-bump-versions.yaml': true,
  'check-docs-links.yml': true,
  'check-migration-timestamps.yml': true,
  'check-migrations.yml': true,
  'codecov.yaml': true,
  'codeql.yml': true,
  'codex-plugin.yaml': true,
  'discord-python-ci.yml': true,
  'docker-setup-check.yaml': true,
  'e2e-tests.yaml': true,
  'external-internal-packages.yaml': true,
  'i18n-check.yaml': true,
  'mobile.yaml': true,
  'release-ai-package.yaml': true,
  'release-supabase-package.yaml': true,
  'release-types-package.yaml': true,
  'release-typescript-config-package.yaml': true,
  'release-ui-package.yaml': true,
  'rust-backend.yml': true,
  'supabase-production.yaml': true,
  'supabase-staging.yaml': true,
  'supabase-types.yaml': true,
  'turbo-unit-tests.yaml': true,
  'type-check.yaml': true,
  'vercel-preview-calendar.yaml': true,
  'vercel-preview-cms.yaml': true,
  'vercel-preview-finance.yaml': true,
  'vercel-preview-nova.yaml': true,
  'vercel-preview-platform.yaml': true,
  'vercel-preview-rewise.yaml': true,
  'vercel-preview-shortener.yaml': true,
  'vercel-preview-tasks.yaml': true,
  'vercel-preview-meet.yaml': true,
  'vercel-preview-learn.yaml': true,
  'vercel-preview-track.yaml': true,
  'vercel-production-calendar.yaml': true,
  'vercel-production-cms.yaml': true,
  'vercel-production-finance.yaml': true,
  'vercel-production-nova.yaml': true,
  'vercel-production-platform.yaml': true,
  'vercel-production-rewise.yaml': true,
  'vercel-production-shortener.yaml': true,
  'vercel-production-tasks.yaml': true,
  'vercel-production-meet.yaml': true,
  'vercel-production-learn.yaml': true,
  'vercel-production-track.yaml': true,
  'mobile-build-ios.yaml': true,
  'mobile-build-android.yaml': true,
  'mobile-build-windows.yaml': true,
  'mobile-build-macos.yaml': true,
};

export type WorkflowDecision = {
  matchedPaths: string[];
  reason: string;
  shouldRun: boolean;
};

export type WorkspaceManifest = {
  dependencies: string[];
  name: string;
  path: string;
};

export type WorkflowDecisionInput = {
  changedFiles?: string[] | null;
  ciConfig?: Record<string, boolean | undefined>;
  eventName?: string;
  workflowName: string;
  workspaceManifests?: WorkspaceManifest[];
};

export type VercelWorkflowTarget = {
  app: string;
  appPath: string;
  packageName: string;
  previewWorkflow: string;
  productionWorkflow: string;
};

export const vercelWorkflowTargets = [
  {
    app: 'calendar',
    appPath: 'apps/calendar',
    packageName: '@tuturuuu/calendar',
    previewWorkflow: 'vercel-preview-calendar.yaml',
    productionWorkflow: 'vercel-production-calendar.yaml',
  },
  {
    app: 'cms',
    appPath: 'apps/cms',
    packageName: '@tuturuuu/cms',
    previewWorkflow: 'vercel-preview-cms.yaml',
    productionWorkflow: 'vercel-production-cms.yaml',
  },
  {
    app: 'finance',
    appPath: 'apps/finance',
    packageName: '@tuturuuu/finance',
    previewWorkflow: 'vercel-preview-finance.yaml',
    productionWorkflow: 'vercel-production-finance.yaml',
  },
  {
    app: 'meet',
    appPath: 'apps/meet',
    packageName: '@tuturuuu/meet',
    previewWorkflow: 'vercel-preview-meet.yaml',
    productionWorkflow: 'vercel-production-meet.yaml',
  },
  {
    app: 'nova',
    appPath: 'apps/nova',
    packageName: '@tuturuuu/nova',
    previewWorkflow: 'vercel-preview-nova.yaml',
    productionWorkflow: 'vercel-production-nova.yaml',
  },
  {
    app: 'platform',
    appPath: 'apps/web',
    packageName: '@tuturuuu/web',
    previewWorkflow: 'vercel-preview-platform.yaml',
    productionWorkflow: 'vercel-production-platform.yaml',
  },
  {
    app: 'rewise',
    appPath: 'apps/rewise',
    packageName: '@tuturuuu/rewise',
    previewWorkflow: 'vercel-preview-rewise.yaml',
    productionWorkflow: 'vercel-production-rewise.yaml',
  },
  {
    app: 'shortener',
    appPath: 'apps/shortener',
    packageName: '@tuturuuu/shortener',
    previewWorkflow: 'vercel-preview-shortener.yaml',
    productionWorkflow: 'vercel-production-shortener.yaml',
  },
  {
    app: 'tasks',
    appPath: 'apps/tasks',
    packageName: '@tuturuuu/tasks',
    previewWorkflow: 'vercel-preview-tasks.yaml',
    productionWorkflow: 'vercel-production-tasks.yaml',
  },
  {
    app: 'track',
    appPath: 'apps/track',
    packageName: '@tuturuuu/track',
    previewWorkflow: 'vercel-preview-track.yaml',
    productionWorkflow: 'vercel-production-track.yaml',
  },
  {
    app: 'learn',
    appPath: 'apps/learn',
    packageName: '@tuturuuu/learn',
    previewWorkflow: 'vercel-preview-learn.yaml',
    productionWorkflow: 'vercel-production-learn.yaml',
  },
] satisfies VercelWorkflowTarget[];

const globalVercelAffectingPaths = new Set([
  '.github/workflows/ci-check.yml',
  'bun.lock',
  'package.json',
  'turbo.json',
  'tuturuuu.ts',
]);

const vercelTargetsByWorkflow = new Map(
  vercelWorkflowTargets.flatMap((target) => [
    [target.previewWorkflow, target],
    [target.productionWorkflow, target],
  ])
);

function getConfiguredDecision(
  workflowName: string,
  ciConfig: Record<string, boolean | undefined>
): boolean {
  return ciConfig[workflowName] ?? true;
}

function normalizeChangedPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isOwnWorkflowChange(filePath: string, workflowName: string): boolean {
  return filePath === `.github/workflows/${workflowName}`;
}

function getWorkspaceDirFromPath(filePath: string): string | null {
  const match = /^(apps|packages)\/[^/]+(?:\/|$)/.exec(filePath);
  return match?.[0].replace(/\/$/, '') ?? null;
}

function buildWorkspaceDependencyClosure(
  packageName: string,
  manifests: WorkspaceManifest[]
): Set<string> | null {
  const manifestsByName = new Map(
    manifests.map((manifest) => [manifest.name, manifest])
  );
  const rootManifest = manifestsByName.get(packageName);

  if (!rootManifest) {
    return null;
  }

  const closure = new Set<string>();
  const stack = [rootManifest.name];

  while (stack.length > 0) {
    const currentName = stack.pop();

    if (!currentName || closure.has(currentName)) {
      continue;
    }

    closure.add(currentName);

    const manifest = manifestsByName.get(currentName);

    if (!manifest) {
      continue;
    }

    for (const dependencyName of manifest.dependencies) {
      if (manifestsByName.has(dependencyName)) {
        stack.push(dependencyName);
      }
    }
  }

  return closure;
}

function getChangedWorkspaceName(
  filePath: string,
  manifests: WorkspaceManifest[]
): string | null {
  const workspaceDir = getWorkspaceDirFromPath(filePath);

  if (!workspaceDir) {
    return null;
  }

  return (
    manifests.find((manifest) => manifest.path === workspaceDir)?.name ?? null
  );
}

export function getWorkflowDecision({
  changedFiles,
  ciConfig = ci,
  eventName,
  workflowName,
  workspaceManifests = [],
}: WorkflowDecisionInput): WorkflowDecision {
  const configured = getConfiguredDecision(workflowName, ciConfig);

  if (!configured) {
    return {
      matchedPaths: [],
      reason: `${workflowName} is disabled in tuturuuu.ts`,
      shouldRun: false,
    };
  }

  if (eventName === 'workflow_dispatch') {
    return {
      matchedPaths: [],
      reason: 'workflow_dispatch bypasses affected-path gating',
      shouldRun: true,
    };
  }

  const target = vercelTargetsByWorkflow.get(workflowName);

  if (!target) {
    return {
      matchedPaths: [],
      reason: `${workflowName} uses static tuturuuu.ts gating`,
      shouldRun: configured,
    };
  }

  const normalizedChangedFiles =
    changedFiles?.map(normalizeChangedPath).filter(Boolean) ?? null;

  if (!normalizedChangedFiles || normalizedChangedFiles.length === 0) {
    return {
      matchedPaths: [],
      reason: 'changed-file state is unavailable, so Vercel gating is open',
      shouldRun: true,
    };
  }

  const dependencyClosure = buildWorkspaceDependencyClosure(
    target.packageName,
    workspaceManifests
  );

  if (!dependencyClosure) {
    return {
      matchedPaths: [],
      reason: `workspace manifest for ${target.packageName} is unavailable`,
      shouldRun: true,
    };
  }

  const matchedPaths = normalizedChangedFiles.filter((filePath) => {
    if (globalVercelAffectingPaths.has(filePath)) {
      return true;
    }

    if (isOwnWorkflowChange(filePath, workflowName)) {
      return true;
    }

    if (
      filePath === target.appPath ||
      filePath.startsWith(`${target.appPath}/`)
    ) {
      return true;
    }

    const changedWorkspaceName = getChangedWorkspaceName(
      filePath,
      workspaceManifests
    );

    return changedWorkspaceName
      ? dependencyClosure.has(changedWorkspaceName)
      : false;
  });

  if (matchedPaths.length > 0) {
    return {
      matchedPaths,
      reason: `${workflowName} is affected by ${matchedPaths.length} changed path(s)`,
      shouldRun: true,
    };
  }

  return {
    matchedPaths: [],
    reason: `${workflowName} is unaffected by the changed paths`,
    shouldRun: false,
  };
}
