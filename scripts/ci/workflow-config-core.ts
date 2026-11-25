import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtraWorkspaceEdges, WorkspaceManifest } from '../../tuturuuu.ts';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function getWorkspaceDependencies(packageJson: PackageJson): string[] {
  const dependencySources = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
  ];
  const workspaceDependencies = new Set<string>();

  for (const dependencies of dependencySources) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (version.startsWith('workspace:')) {
        workspaceDependencies.add(name);
      }
    }
  }

  return [...workspaceDependencies].sort();
}

function readPackageJson(packagePath: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson;
  } catch (error) {
    console.warn(
      `Unable to read ${packagePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export function readWorkspaceManifests(rootDir: string): WorkspaceManifest[] {
  const manifests: WorkspaceManifest[] = [];

  for (const group of ['apps', 'packages']) {
    const groupPath = join(rootDir, group);

    if (!existsSync(groupPath)) {
      continue;
    }

    for (const entry of readdirSync(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const workspacePath = `${group}/${entry.name}`;
      const packagePath = join(rootDir, workspacePath, 'package.json');

      if (!existsSync(packagePath)) {
        continue;
      }

      const packageJson = readPackageJson(packagePath);

      if (!packageJson?.name) {
        continue;
      }

      manifests.push({
        dependencies: getWorkspaceDependencies(packageJson),
        name: packageJson.name,
        path: workspacePath,
      });
    }
  }

  return manifests.sort((a, b) => a.path.localeCompare(b.path));
}

export const EXTRA_WORKSPACE_EDGES_PATH =
  'scripts/ci/affected-apps.extra-edges.json';

// Undeclared relative-import edges shared with affected-apps.mjs. A missing
// or malformed file leaves selection on the declared dependency graph.
export function readExtraWorkspaceEdges(
  rootDir: string
): ExtraWorkspaceEdges | null {
  const edgesPath = join(rootDir, EXTRA_WORKSPACE_EDGES_PATH);
  if (!existsSync(edgesPath)) {
    console.warn(`Unable to read ${edgesPath}: extra edges are ignored`);
    return null;
  }
  try {
    const edges: unknown = JSON.parse(readFileSync(edgesPath, 'utf8'));
    if (
      !edges ||
      typeof edges !== 'object' ||
      Array.isArray(edges) ||
      Object.values(edges).some(
        (dependents) =>
          !Array.isArray(dependents) ||
          dependents.some((dependent) => typeof dependent !== 'string')
      )
    ) {
      throw new Error('expected { "<path prefix>": ["<workspace dir>"] }');
    }
    return edges as ExtraWorkspaceEdges;
  } catch (error) {
    console.warn(
      `Unable to read ${edgesPath}: ${
        error instanceof Error ? error.message : String(error)
      }; extra edges are ignored`
    );
    return null;
  }
}

export function splitChangedFiles(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((filePath) => filePath.trim())
    .filter(Boolean);
}
