import { ci } from './tuturuuu.ci.ts';

export { ci } from './tuturuuu.ci.ts';

export type WorkflowDecision = {
  matchedPaths: string[];
  reason: string;
  shouldRun: boolean;
};

export type WorkspaceManifest = {
  readonly dependencies: readonly string[];
  readonly name: string;
  readonly path: string;
};

export type WorkflowDecisionInput = {
  changedFiles?: string[] | null;
  ciConfig?: Record<string, boolean | undefined>;
  eventName?: string;
  workflowName: string;
  workspaceManifests?: readonly WorkspaceManifest[];
};

type VercelWorkflowTargetBase = {
  app: string;
  appPath: string;
  packageName: string;
  previewWorkflow: string;
  productionWorkflow: string;
};

export type VercelWorkflowTarget = VercelWorkflowTargetBase &
  (
    | {
        buildInfoApp: string;
        framework: 'next';
      }
    | {
        framework: 'tanstack-start';
      }
  );

export const vercelWorkflowTargets = [
  {
    app: 'ai',
    appPath: 'apps/ai',
    buildInfoApp: 'ai',
    framework: 'next',
    packageName: '@tuturuuu/ai-studio',
    previewWorkflow: 'vercel-preview-ai.yaml',
    productionWorkflow: 'vercel-production-ai.yaml',
  },
  {
    app: 'apps',
    appPath: 'apps/apps',
    buildInfoApp: 'apps',
    framework: 'next',
    packageName: '@tuturuuu/apps',
    previewWorkflow: 'vercel-preview-apps.yaml',
    productionWorkflow: 'vercel-production-apps.yaml',
  },
  {
    app: 'calendar',
    appPath: 'apps/calendar',
    buildInfoApp: 'calendar',
    framework: 'next',
    packageName: '@tuturuuu/calendar',
    previewWorkflow: 'vercel-preview-calendar.yaml',
    productionWorkflow: 'vercel-production-calendar.yaml',
  },
  {
    app: 'chat',
    appPath: 'apps/chat',
    buildInfoApp: 'chat',
    framework: 'next',
    packageName: '@tuturuuu/chat',
    previewWorkflow: 'vercel-preview-chat.yaml',
    productionWorkflow: 'vercel-production-chat.yaml',
  },
  {
    app: 'cms',
    appPath: 'apps/cms',
    buildInfoApp: 'cms',
    framework: 'next',
    packageName: '@tuturuuu/cms',
    previewWorkflow: 'vercel-preview-cms.yaml',
    productionWorkflow: 'vercel-production-cms.yaml',
  },
  {
    app: 'drive',
    appPath: 'apps/drive',
    buildInfoApp: 'drive',
    framework: 'next',
    packageName: '@tuturuuu/drive',
    previewWorkflow: 'vercel-preview-drive.yaml',
    productionWorkflow: 'vercel-production-drive.yaml',
  },
  {
    app: 'finance',
    appPath: 'apps/finance',
    buildInfoApp: 'finance',
    framework: 'next',
    packageName: '@tuturuuu/finance',
    previewWorkflow: 'vercel-preview-finance.yaml',
    productionWorkflow: 'vercel-production-finance.yaml',
  },
  {
    app: 'inventory',
    appPath: 'apps/inventory',
    buildInfoApp: 'inventory',
    framework: 'next',
    packageName: '@tuturuuu/inventory',
    previewWorkflow: 'vercel-preview-inventory.yaml',
    productionWorkflow: 'vercel-production-inventory.yaml',
  },
  {
    app: 'infrastructure',
    appPath: 'apps/infrastructure',
    buildInfoApp: 'infrastructure',
    framework: 'next',
    packageName: '@tuturuuu/infrastructure',
    previewWorkflow: 'vercel-preview-infrastructure.yaml',
    productionWorkflow: 'vercel-production-infrastructure.yaml',
  },
  {
    app: 'storefront',
    appPath: 'apps/storefront',
    buildInfoApp: 'storefront',
    framework: 'next',
    packageName: '@tuturuuu/storefront',
    previewWorkflow: 'vercel-preview-storefront.yaml',
    productionWorkflow: 'vercel-production-storefront.yaml',
  },
  {
    app: 'meet',
    appPath: 'apps/meet',
    buildInfoApp: 'meet',
    framework: 'next',
    packageName: '@tuturuuu/meet',
    previewWorkflow: 'vercel-preview-meet.yaml',
    productionWorkflow: 'vercel-production-meet.yaml',
  },
  {
    app: 'mail',
    appPath: 'apps/mail',
    buildInfoApp: 'mail',
    framework: 'next',
    packageName: '@tuturuuu/mail',
    previewWorkflow: 'vercel-preview-mail.yaml',
    productionWorkflow: 'vercel-production-mail.yaml',
  },
  {
    app: 'tanstack-web',
    appPath: 'apps/tanstack-web',
    framework: 'tanstack-start',
    packageName: '@tuturuuu/tanstack-web',
    previewWorkflow: 'vercel-preview-tanstack-web.yaml',
    productionWorkflow: 'vercel-production-tanstack-web.yaml',
  },
  {
    app: 'mind',
    appPath: 'apps/mind',
    buildInfoApp: 'mind',
    framework: 'next',
    packageName: '@tuturuuu/mind',
    previewWorkflow: 'vercel-preview-mind.yaml',
    productionWorkflow: 'vercel-production-mind.yaml',
  },
  {
    app: 'nova',
    appPath: 'apps/nova',
    buildInfoApp: 'nova',
    framework: 'next',
    packageName: '@tuturuuu/nova',
    previewWorkflow: 'vercel-preview-nova.yaml',
    productionWorkflow: 'vercel-production-nova.yaml',
  },
  {
    app: 'platform',
    appPath: 'apps/web',
    buildInfoApp: 'web',
    framework: 'next',
    packageName: '@tuturuuu/web',
    previewWorkflow: 'vercel-preview-platform.yaml',
    productionWorkflow: 'vercel-production-platform.yaml',
  },
  {
    app: 'tools',
    appPath: 'apps/tools',
    buildInfoApp: 'tools',
    framework: 'next',
    packageName: '@tuturuuu/tools',
    previewWorkflow: 'vercel-preview-tools.yaml',
    productionWorkflow: 'vercel-production-tools.yaml',
  },
  {
    app: 'rewise',
    appPath: 'apps/rewise',
    buildInfoApp: 'rewise',
    framework: 'next',
    packageName: '@tuturuuu/rewise',
    previewWorkflow: 'vercel-preview-rewise.yaml',
    productionWorkflow: 'vercel-production-rewise.yaml',
  },
  {
    app: 'shortener',
    appPath: 'apps/shortener',
    buildInfoApp: 'shortener',
    framework: 'next',
    packageName: '@tuturuuu/shortener',
    previewWorkflow: 'vercel-preview-shortener.yaml',
    productionWorkflow: 'vercel-production-shortener.yaml',
  },
  {
    app: 'tasks',
    appPath: 'apps/tasks',
    buildInfoApp: 'tasks',
    framework: 'next',
    packageName: '@tuturuuu/tasks',
    previewWorkflow: 'vercel-preview-tasks.yaml',
    productionWorkflow: 'vercel-production-tasks.yaml',
  },
  {
    app: 'teach',
    appPath: 'apps/teach',
    buildInfoApp: 'teach',
    framework: 'next',
    packageName: '@tuturuuu/teach',
    previewWorkflow: 'vercel-preview-teach.yaml',
    productionWorkflow: 'vercel-production-teach.yaml',
  },
  {
    app: 'track',
    appPath: 'apps/track',
    buildInfoApp: 'track',
    framework: 'next',
    packageName: '@tuturuuu/track',
    previewWorkflow: 'vercel-preview-track.yaml',
    productionWorkflow: 'vercel-production-track.yaml',
  },
  {
    app: 'learn',
    appPath: 'apps/learn',
    buildInfoApp: 'learn',
    framework: 'next',
    packageName: '@tuturuuu/learn',
    previewWorkflow: 'vercel-preview-learn.yaml',
    productionWorkflow: 'vercel-production-learn.yaml',
  },
  {
    app: 'pay',
    appPath: 'apps/pay',
    buildInfoApp: 'pay',
    framework: 'next',
    packageName: '@tuturuuu/pay',
    previewWorkflow: 'vercel-preview-pay.yaml',
    productionWorkflow: 'vercel-production-pay.yaml',
  },
  {
    app: 'contacts',
    appPath: 'apps/contacts',
    buildInfoApp: 'contacts',
    framework: 'next',
    packageName: '@tuturuuu/contacts',
    previewWorkflow: 'vercel-preview-contacts.yaml',
    productionWorkflow: 'vercel-production-contacts.yaml',
  },
  {
    app: 'forms',
    appPath: 'apps/forms',
    buildInfoApp: 'forms',
    framework: 'next',
    packageName: '@tuturuuu/forms',
    previewWorkflow: 'vercel-preview-forms.yaml',
    productionWorkflow: 'vercel-production-forms.yaml',
  },
  {
    app: 'git',
    appPath: 'apps/git',
    buildInfoApp: 'git',
    framework: 'next',
    packageName: '@tuturuuu/git',
    previewWorkflow: 'vercel-preview-git.yaml',
    productionWorkflow: 'vercel-production-git.yaml',
  },
] satisfies VercelWorkflowTarget[];

const globalVercelAffectingPaths = new Set([
  '.github/actions/run-with-turbo-remote-cache/action.yml',
  '.github/actions/setup-bun-with-retry/action.yml',
  'bun.lock',
  'package.json',
  'scripts/ci/generate-build-metadata.ts',
  'turbo.json',
]);

const databaseMigrationWorkflows = new Set([
  'supabase-production.yaml',
  'supabase-staging.yaml',
]);

const databaseMigrationAffectingPaths = new Set([
  '.github/actions/setup-supabase-cli-with-retry/action.yml',
  '.github/workflows/supabase-production.yaml',
  '.github/workflows/supabase-staging.yaml',
  'scripts/ci/check-workflow-config.ts',
  'scripts/ci/github-deployment-markers.ts',
  'scripts/ci/record-deployment-marker.ts',
  'scripts/ci/resolve-changed-files-core.ts',
  'scripts/ci/resolve-changed-files.ts',
  'scripts/ci/workflow-config-core.ts',
  'tuturuuu.ts',
]);

const scopedVercelAffectingPaths = [
  {
    apps: new Set(['inventory', 'storefront']),
    prefix: 'packages/ui/src/components/ui/storefront/',
  },
] as const;

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

function isDatabaseSchemaPath(filePath: string): boolean {
  return filePath === 'apps/database' || filePath.startsWith('apps/database/');
}

function isDatabaseMigrationAffectingPath(filePath: string): boolean {
  return (
    isDatabaseSchemaPath(filePath) ||
    databaseMigrationAffectingPaths.has(filePath)
  );
}

function getWorkspaceDirFromPath(filePath: string): string | null {
  const match = /^(apps|packages)\/[^/]+(?:\/|$)/.exec(filePath);
  return match?.[0].replace(/\/$/, '') ?? null;
}

function getScopedVercelOwners(filePath: string): ReadonlySet<string> | null {
  return (
    scopedVercelAffectingPaths.find(({ prefix }) => filePath.startsWith(prefix))
      ?.apps ?? null
  );
}

type WorkspaceDependencyCache = {
  closureByPackage: Map<string, Set<string> | null>;
  manifestsByName: Map<string, WorkspaceManifest>;
};

const WORKSPACE_DEPENDENCY_CONTENT_CACHE_LIMIT = 16;
const workspaceDependencyCacheByReference = new WeakMap<
  readonly WorkspaceManifest[],
  WorkspaceDependencyCache
>();
const workspaceDependencyCacheByContent = new Map<
  string,
  WorkspaceDependencyCache
>();

function getWorkspaceDependencyCacheKey(
  manifests: readonly WorkspaceManifest[]
): string {
  return JSON.stringify(
    manifests
      .map(({ dependencies, name, path }) => ({
        dependencies: [...dependencies].sort(),
        name,
        path,
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.path.localeCompare(right.path) ||
          JSON.stringify(left.dependencies).localeCompare(
            JSON.stringify(right.dependencies)
          )
      )
  );
}

function getWorkspaceDependencyCache(
  manifests: readonly WorkspaceManifest[]
): WorkspaceDependencyCache {
  const referenceMatch = workspaceDependencyCacheByReference.get(manifests);

  if (referenceMatch) {
    return referenceMatch;
  }

  const contentKey = getWorkspaceDependencyCacheKey(manifests);
  let cache = workspaceDependencyCacheByContent.get(contentKey);

  if (cache) {
    workspaceDependencyCacheByContent.delete(contentKey);
    workspaceDependencyCacheByContent.set(contentKey, cache);
  } else {
    cache = {
      closureByPackage: new Map(),
      manifestsByName: new Map(
        manifests.map((manifest) => [manifest.name, manifest])
      ),
    };
    workspaceDependencyCacheByContent.set(contentKey, cache);

    if (
      workspaceDependencyCacheByContent.size >
      WORKSPACE_DEPENDENCY_CONTENT_CACHE_LIMIT
    ) {
      const oldestKey = workspaceDependencyCacheByContent.keys().next().value;

      if (oldestKey !== undefined) {
        workspaceDependencyCacheByContent.delete(oldestKey);
      }
    }
  }

  workspaceDependencyCacheByReference.set(manifests, cache);
  return cache;
}

function buildWorkspaceDependencyClosure(
  packageName: string,
  manifests: readonly WorkspaceManifest[]
): Set<string> | null {
  const { closureByPackage, manifestsByName } =
    getWorkspaceDependencyCache(manifests);

  if (closureByPackage.has(packageName)) {
    return closureByPackage.get(packageName) ?? null;
  }

  const rootManifest = manifestsByName.get(packageName);

  if (!rootManifest) {
    closureByPackage.set(packageName, null);
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

  closureByPackage.set(packageName, closure);
  return closure;
}

function getChangedWorkspaceName(
  filePath: string,
  manifests: readonly WorkspaceManifest[]
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

  if (databaseMigrationWorkflows.has(workflowName)) {
    const normalizedChangedFiles =
      changedFiles?.map(normalizeChangedPath).filter(Boolean) ?? null;

    if (!normalizedChangedFiles) {
      return {
        matchedPaths: [],
        reason:
          'changed-file state is unavailable, so database migration gating is open',
        shouldRun: true,
      };
    }

    if (normalizedChangedFiles.length === 0) {
      return {
        matchedPaths: [],
        reason: `${workflowName} migration marker already covers the target SHA`,
        shouldRun: false,
      };
    }

    const matchedPaths = normalizedChangedFiles.filter(
      isDatabaseMigrationAffectingPath
    );

    return {
      matchedPaths,
      reason:
        matchedPaths.length > 0
          ? `${workflowName} is affected by ${matchedPaths.length} database path(s)`
          : `${workflowName} has no pending database path changes`,
      shouldRun: matchedPaths.length > 0,
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

  if (target.app === 'platform') {
    const databasePaths = normalizedChangedFiles.filter(isDatabaseSchemaPath);
    if (databasePaths.length > 0) {
      return {
        matchedPaths: databasePaths,
        reason:
          'platform deployment is required to gate production database migrations',
        shouldRun: true,
      };
    }
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
    const scopedOwners = getScopedVercelOwners(filePath);

    if (scopedOwners) {
      return scopedOwners.has(target.app);
    }

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
