export const ci = {
  'actions-storage-report.yaml': true,
  'biome-check.yaml': true,
  'branch-name-check.yaml': true,
  'cancel-pr-runs-on-close.yaml': true,
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
  'rust-backend.yml': true,
  'i18n-check.yaml': true,
  'mobile.yaml': true,
  'release-ai-package.yaml': true,
  'release-apis-package.yaml': true,
  'release-devbox-package.yaml': true,
  'release-google-package.yaml': true,
  'release-hooks-package.yaml': true,
  'release-icons-package.yaml': true,
  'release-internal-api-package.yaml': true,
  'release-sdk-package.yaml': true,
  'release-supabase-package.yaml': true,
  'release-please.yaml': true,
  'release-types-package.yaml': true,
  'release-typescript-config-package.yaml': true,
  'release-ui-package.yaml': true,
  'release-utils-package.yaml': true,
  'sdk-version-bump.yaml': true,
  'supabase-production.yaml': true,
  'supabase-staging.yaml': true,
  'turbo-unit-tests.yaml': true,
  'type-check.yaml': true,
  'vercel-preview-apps.yaml': true,
  'vercel-preview-calendar.yaml': true,
  'vercel-preview-chat.yaml': true,
  'vercel-preview-cms.yaml': true,
  'vercel-preview-drive.yaml': true,
  'vercel-preview-finance.yaml': true,
  'vercel-preview-inventory.yaml': true,
  'vercel-preview-infrastructure.yaml': true,
  'vercel-preview-storefront.yaml': true,
  'vercel-preview-mind.yaml': true,
  'vercel-preview-nova.yaml': true,
  'vercel-preview-platform.yaml': true,
  'vercel-preview-tools.yaml': true,
  'vercel-preview-rewise.yaml': true,
  'vercel-preview-shortener.yaml': true,
  'vercel-preview-tasks.yaml': true,
  'vercel-preview-meet.yaml': true,
  'vercel-preview-learn.yaml': true,
  'vercel-preview-mail.yaml': true,
  'vercel-preview-tanstack-web.yaml': true,
  'vercel-preview-teach.yaml': true,
  'vercel-preview-pay.yaml': true,
  'vercel-preview-contacts.yaml': true,
  'vercel-preview-track.yaml': true,
  'vercel-production-apps.yaml': true,
  'vercel-production-calendar.yaml': true,
  'vercel-production-chat.yaml': true,
  'vercel-production-cms.yaml': true,
  'vercel-production-drive.yaml': true,
  'vercel-production-finance.yaml': true,
  'vercel-production-inventory.yaml': true,
  'vercel-production-infrastructure.yaml': true,
  'vercel-production-storefront.yaml': true,
  'vercel-production-mind.yaml': true,
  'vercel-production-nova.yaml': true,
  'vercel-production-platform.yaml': true,
  'vercel-production-tools.yaml': true,
  'vercel-production-rewise.yaml': true,
  'vercel-production-shortener.yaml': true,
  'vercel-production-tasks.yaml': true,
  'vercel-production-meet.yaml': true,
  'vercel-production-learn.yaml': true,
  'vercel-production-mail.yaml': true,
  'vercel-production-tanstack-web.yaml': true,
  'vercel-production-teach.yaml': true,
  'vercel-production-pay.yaml': true,
  'vercel-production-contacts.yaml': true,
  'vercel-production-track.yaml': true,
  'vercel-production.yaml': true,
  'mobile-build-ios.yaml': true,
  'mobile-build-android.yaml': true,
  'mobile-build-windows.yaml': true,
  'mobile-build-macos.yaml': true,
  'mobile-deploy-stores.yaml': true,
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
    app: 'apps',
    appPath: 'apps/apps',
    packageName: '@tuturuuu/apps',
    previewWorkflow: 'vercel-preview-apps.yaml',
    productionWorkflow: 'vercel-production-apps.yaml',
  },
  {
    app: 'calendar',
    appPath: 'apps/calendar',
    packageName: '@tuturuuu/calendar',
    previewWorkflow: 'vercel-preview-calendar.yaml',
    productionWorkflow: 'vercel-production-calendar.yaml',
  },
  {
    app: 'chat',
    appPath: 'apps/chat',
    packageName: '@tuturuuu/chat',
    previewWorkflow: 'vercel-preview-chat.yaml',
    productionWorkflow: 'vercel-production-chat.yaml',
  },
  {
    app: 'cms',
    appPath: 'apps/cms',
    packageName: '@tuturuuu/cms',
    previewWorkflow: 'vercel-preview-cms.yaml',
    productionWorkflow: 'vercel-production-cms.yaml',
  },
  {
    app: 'drive',
    appPath: 'apps/drive',
    packageName: '@tuturuuu/drive',
    previewWorkflow: 'vercel-preview-drive.yaml',
    productionWorkflow: 'vercel-production-drive.yaml',
  },
  {
    app: 'finance',
    appPath: 'apps/finance',
    packageName: '@tuturuuu/finance',
    previewWorkflow: 'vercel-preview-finance.yaml',
    productionWorkflow: 'vercel-production-finance.yaml',
  },
  {
    app: 'inventory',
    appPath: 'apps/inventory',
    packageName: '@tuturuuu/inventory',
    previewWorkflow: 'vercel-preview-inventory.yaml',
    productionWorkflow: 'vercel-production-inventory.yaml',
  },
  {
    app: 'infrastructure',
    appPath: 'apps/infrastructure',
    packageName: '@tuturuuu/infrastructure',
    previewWorkflow: 'vercel-preview-infrastructure.yaml',
    productionWorkflow: 'vercel-production-infrastructure.yaml',
  },
  {
    app: 'storefront',
    appPath: 'apps/storefront',
    packageName: '@tuturuuu/storefront',
    previewWorkflow: 'vercel-preview-storefront.yaml',
    productionWorkflow: 'vercel-production-storefront.yaml',
  },
  {
    app: 'meet',
    appPath: 'apps/meet',
    packageName: '@tuturuuu/meet',
    previewWorkflow: 'vercel-preview-meet.yaml',
    productionWorkflow: 'vercel-production-meet.yaml',
  },
  {
    app: 'mail',
    appPath: 'apps/mail',
    packageName: '@tuturuuu/mail',
    previewWorkflow: 'vercel-preview-mail.yaml',
    productionWorkflow: 'vercel-production-mail.yaml',
  },
  {
    app: 'tanstack-web',
    appPath: 'apps/tanstack-web',
    packageName: '@tuturuuu/tanstack-web',
    previewWorkflow: 'vercel-preview-tanstack-web.yaml',
    productionWorkflow: 'vercel-production-tanstack-web.yaml',
  },
  {
    app: 'mind',
    appPath: 'apps/mind',
    packageName: '@tuturuuu/mind',
    previewWorkflow: 'vercel-preview-mind.yaml',
    productionWorkflow: 'vercel-production-mind.yaml',
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
    app: 'tools',
    appPath: 'apps/tools',
    packageName: '@tuturuuu/tools',
    previewWorkflow: 'vercel-preview-tools.yaml',
    productionWorkflow: 'vercel-production-tools.yaml',
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
    app: 'teach',
    appPath: 'apps/teach',
    packageName: '@tuturuuu/teach',
    previewWorkflow: 'vercel-preview-teach.yaml',
    productionWorkflow: 'vercel-production-teach.yaml',
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
  {
    app: 'pay',
    appPath: 'apps/pay',
    packageName: '@tuturuuu/pay',
    previewWorkflow: 'vercel-preview-pay.yaml',
    productionWorkflow: 'vercel-production-pay.yaml',
  },
  {
    app: 'contacts',
    appPath: 'apps/contacts',
    packageName: '@tuturuuu/contacts',
    previewWorkflow: 'vercel-preview-contacts.yaml',
    productionWorkflow: 'vercel-production-contacts.yaml',
  },
] satisfies VercelWorkflowTarget[];

const globalVercelAffectingPaths = new Set([
  '.github/actions/run-with-turbo-remote-cache/action.yml',
  '.github/actions/setup-bun-with-retry/action.yml',
  '.github/workflows/vercel-production.yaml',
  'bun.lock',
  'package.json',
  'scripts/ci/generate-build-metadata.ts',
  'scripts/ci/resolve-production-vercel-targets.ts',
  'scripts/ci/workflow-config-core.ts',
  'turbo.json',
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

const workspaceDependencyClosureCache = new WeakMap<
  WorkspaceManifest[],
  Map<string, Set<string> | null>
>();

function buildWorkspaceDependencyClosure(
  packageName: string,
  manifests: WorkspaceManifest[]
): Set<string> | null {
  let closureByPackage = workspaceDependencyClosureCache.get(manifests);

  if (!closureByPackage) {
    closureByPackage = new Map();
    workspaceDependencyClosureCache.set(manifests, closureByPackage);
  }

  if (closureByPackage.has(packageName)) {
    return closureByPackage.get(packageName) ?? null;
  }

  const manifestsByName = new Map(
    manifests.map((manifest) => [manifest.name, manifest])
  );
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
