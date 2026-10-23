import { randomUUID } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { resourceShims } from './resources-command';
import {
  assertLaneBudget,
  atomicJson,
  canonical,
  defaultResourceConfig,
  maxResourceLanes,
  type ResourceConfig,
  readResourceConfig,
  repositoryIdentity,
  resourceLanes,
  resourceMaxLanes,
  resourcePolicyKey,
  type ValidationLanes,
} from './resources-config';
import { resourceQueueStatus } from './resources-queue';
import { withAdmission } from './resources-slots';

const start = '# >>> ttr resources >>>';
const end = '# <<< ttr resources <<<';
export const shellQuote = (value: string) =>
  `'${value.replaceAll("'", "'\\''")}'`;

export function stableResourceEntry(entry: string) {
  for (const store of ['.bun', '.pnpm']) {
    const index = entry.indexOf(`/node_modules/${store}/`);
    if (index < 0) continue;
    const candidate = join(
      entry.slice(0, index),
      'node_modules/tuturuuu/dist/cli',
      basename(entry)
    );
    // Keep the public package link, not the versioned store it resolves to.
    // Verify its target so a different installation cannot redirect the shim.
    if (existsSync(candidate) && canonical(candidate) === canonical(entry))
      return candidate;
  }
  return entry;
}

export function removeResourceHook(content: string) {
  const begin = content.indexOf(start);
  if (begin < 0) return content;
  const finish = content.indexOf(end, begin);
  if (finish < 0)
    throw new Error(
      'Incomplete ttr resource shell block; inspect it before modifying this file.'
    );
  return (
    content.slice(0, begin) +
    content.slice(finish + end.length).replace(/^\r?\n/, '')
  );
}

export function resourceShellFiles(shell: string, home = homedir()) {
  if (shell === 'none') return [];
  if (shell === 'zsh')
    return ['.zshenv', '.zprofile', '.zshrc'].map((file) =>
      join(process.env.ZDOTDIR || home, file)
    );
  if (shell === 'bash') {
    const login =
      ['.bash_profile', '.bash_login', '.profile'].find((file) =>
        existsSync(join(home, file))
      ) || '.profile';
    return [join(home, '.bashrc'), join(home, login)];
  }
  throw new Error('Use --shell zsh, --shell bash, or --shell none.');
}

interface InstallManifest {
  shellFiles: string[];
  shims: string[];
}

interface SetupOptions {
  home: string;
  roots: string[];
  shell: string;
  workers?: number;
  lanes?: ValidationLanes;
  maxLanes?: number;
  dryRun?: boolean;
}
export async function setupResources(options: SetupOptions) {
  if (options.dryRun) return prepareResources(options);
  return withAdmission(options.home, () => prepareResources(options));
}
async function prepareResources(options: SetupOptions) {
  if (!['darwin', 'linux'].includes(process.platform))
    throw new Error('Resource setup currently supports macOS and Linux.');
  const previous = await readResourceConfig(options.home);
  if (
    options.lanes !== undefined &&
    (!Number.isInteger(options.lanes) ||
      options.lanes < 1 ||
      options.lanes > maxResourceLanes)
  )
    throw new Error(
      `--lanes must be an integer from 1 to ${maxResourceLanes}.`
    );
  const config: ResourceConfig = previous
    ? {
        ...previous,
        roots: [...previous.roots],
        repositories: [...previous.repositories],
      }
    : defaultResourceConfig();
  config.enabled = true;
  for (const root of options.roots.length ? options.roots : [process.cwd()]) {
    const path = canonical(root);
    if (!existsSync(path))
      throw new Error(`Project root does not exist: ${path}`);
    config.roots.push(path);
    const repository = repositoryIdentity(path);
    if (repository) config.repositories.push(repository);
  }
  config.roots = [...new Set(config.roots)];
  config.repositories = [...new Set(config.repositories)];
  if (options.workers !== undefined) {
    if (
      !Number.isInteger(options.workers) ||
      options.workers < 1 ||
      options.workers > 64
    )
      throw new Error('--workers must be an integer from 1 to 64.');
    config.vitestWorkers = options.workers;
    config.buildJobs = options.workers;
  }
  config.validationLanes = options.lanes ?? resourceLanes(config);
  config.maxValidationLanes =
    options.maxLanes ??
    (previous && resourceMaxLanes(previous) > resourceLanes(previous)
      ? Math.max(resourceLanes(config), resourceMaxLanes(previous))
      : resourceLanes(config));
  if (
    !Number.isInteger(config.maxValidationLanes) ||
    config.maxValidationLanes < resourceLanes(config) ||
    config.maxValidationLanes > maxResourceLanes
  )
    throw new Error(
      `--max-lanes must be an integer between the base lane count and ${maxResourceLanes}.`
    );
  assertLaneBudget(config);
  const assertIdle = async () => {
    if (
      resourcePolicyKey(previous || defaultResourceConfig()) ===
      resourcePolicyKey(config)
    )
      return;
    const state = await resourceQueueStatus(options.home);
    if (state.occupied || state.waiting.length)
      throw new Error(
        'Wait for all resource owners and tickets to drain before changing lanes or worker budgets.'
      );
  };
  const shellFiles = resourceShellFiles(options.shell);
  const bin = join(options.home, 'bin');
  const entry = stableResourceEntry(
    join(
      __dirname,
      __filename.endsWith('.ts') ? 'resources-entry.ts' : 'resources-entry.js'
    )
  );
  const plan = {
    config,
    home: options.home,
    bin,
    shellFiles,
    runtime: process.execPath,
    entry,
  };
  if (options.dryRun) {
    await assertIdle();
    return plan;
  }
  await assertIdle();
  const hook = `${start}\nexport PATH=${shellQuote(bin)}:"$PATH"\n${end}\n`;
  const edits = await Promise.all(
    shellFiles.map(async (path) => {
      const content = await readFile(path, 'utf8').catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return '';
          throw error;
        }
      );
      const stripped = removeResourceHook(content);
      return {
        path,
        content,
        next: `${stripped}${stripped && !stripped.endsWith('\n') ? '\n' : ''}${hook}`,
      };
    })
  );
  await installResourceShims(options.home, entry);
  for (const edit of edits) {
    await mkdir(dirname(edit.path), { recursive: true });
    const backup = join(
      options.home,
      'backups',
      `${Buffer.from(edit.path).toString('base64url')}.original`
    );
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
    if (!existsSync(backup))
      await writeFile(backup, edit.content, { mode: 0o600 });
    await writeFile(edit.path, edit.next, { mode: 0o600 });
  }
  const oldManifest = JSON.parse(
    await readFile(join(options.home, 'install.json'), 'utf8').catch(() => '{}')
  ) as Partial<InstallManifest>;
  await atomicJson(join(options.home, 'install.json'), {
    shellFiles: [
      ...new Set([...(oldManifest.shellFiles || []), ...shellFiles]),
    ],
    shims: resourceShims,
  });
  await atomicJson(join(options.home, 'config.json'), config);
  return plan;
}

export async function uninstallResources(home: string) {
  return withAdmission(home, async () => {
    const config = await readResourceConfig(home);
    if (config)
      await atomicJson(join(home, 'config.json'), {
        ...config,
        enabled: false,
      });
    const state = await resourceQueueStatus(home);
    if (state.occupied || state.waiting.length)
      throw new Error(
        'Admission disabled for new commands. Wait for queued/running jobs to finish before uninstalling.'
      );
    const manifest = JSON.parse(
      await readFile(join(home, 'install.json'), 'utf8').catch(() => '{}')
    ) as Partial<InstallManifest>;
    for (const file of manifest.shellFiles || []) {
      const text = await readFile(file, 'utf8');
      await writeFile(file, removeResourceHook(text));
    }
    for (const name of manifest.shims || resourceShims) {
      if (!resourceShims.includes(name)) continue;
      const path = join(home, 'bin', name);
      const text = await readFile(path, 'utf8').catch(() => '');
      if (text.includes('# Managed by ttr resources')) await rm(path);
    }
    await rm(join(home, 'install.json'), { force: true });
    return { uninstalled: true, preserved: ['config.json', 'backups'] };
  });
}

function resourceLauncher(home: string, entry: string, name: string) {
  return `#!/bin/sh\n# Managed by ttr resources\nTTR_RESOURCES_HOME=${shellQuote(home)} exec ${shellQuote(process.execPath)} ${shellQuote(entry)} shim ${shellQuote(name)} -- "$@"\n`;
}

async function validResourceShim(path: string, expected: string) {
  try {
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW
    );
    try {
      const stat = await file.stat();
      if (
        !stat.isFile() ||
        stat.size !== Buffer.byteLength(expected) ||
        (stat.mode & 0o111) === 0
      )
        return false;
      await access(path, constants.X_OK);
      return (await file.readFile('utf8')) === expected;
    } finally {
      await file.close();
    }
  } catch {
    return false;
  }
}

export async function installedResourceShims(
  home: string,
  entry = join(
    __dirname,
    __filename.endsWith('.ts') ? 'resources-entry.ts' : 'resources-entry.js'
  )
) {
  entry = stableResourceEntry(entry);
  const bin = join(home, 'bin');
  for (const name of resourceShims) {
    const path = join(bin, name);
    const valid = await validResourceShim(
      path,
      resourceLauncher(home, entry, name)
    );
    if (!valid)
      throw new Error(
        'Resource shims are missing, stale, or malformed. Run ttr resources setup --shell none explicitly before retrying; inspect queue occupancy before updating an installation.'
      );
  }
  return bin;
}

export async function installResourceShims(
  home: string,
  entry = join(
    __dirname,
    __filename.endsWith('.ts') ? 'resources-entry.ts' : 'resources-entry.js'
  )
) {
  entry = stableResourceEntry(entry);
  const bin = join(home, 'bin');
  await mkdir(bin, { recursive: true, mode: 0o700 });
  // Never overwrite a file that did not come from this installer.
  for (const name of resourceShims) {
    const path = join(bin, name);
    const existing = await readFile(path, 'utf8').catch(() => undefined);
    if (
      existing !== undefined &&
      !existing.includes('# Managed by ttr resources')
    )
      throw new Error(`Refusing to overwrite unmanaged shim: ${path}`);
  }
  for (const name of resourceShims) {
    const path = join(bin, name);
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, resourceLauncher(home, entry, name), {
      mode: 0o700,
    });
    await chmod(temporary, 0o700);
    await rename(temporary, path);
  }
  return bin;
}
