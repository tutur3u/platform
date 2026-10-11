import type { WorkspaceManifest } from '../../tuturuuu.ts';

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

export function buildWorkspaceDependencyClosure(
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
