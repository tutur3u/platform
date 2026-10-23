// Local Worker runtime harness for cf-migrated native Workers.
// It drives the same Cloudflare Vite plugin runtime that `cf dev` starts:
// `source` serves cloudflare.config.ts through the Vite dev server, while
// `build-output` previews the emitted .cloudflare/output/v0 artifact that
// `cf deploy --prebuilt` publishes. Both bind loopback only, disable remote
// bindings, and receive validated disposable secrets via process env.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readBuildOutputConfig } from './cf-worker-parity.mjs';

export const BUILD_OUTPUT_ROOT = path.join('.cloudflare', 'output', 'v0');

const CONTROL_ENV = {
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
  CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
  CLOUDFLARE_VITE_FORCE_LOCAL: 'true',
};

async function importSourceConfig(root) {
  return (
    await import(pathToFileURL(path.join(root, 'cloudflare.config.ts')).href)
  ).default;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateFixtures(config, secrets) {
  const env = config?.worker?.env;
  if (!isRecord(config?.worker) || (env !== undefined && !isRecord(env))) {
    throw new Error(
      'Expected resolved cf worker.env bindings; use loadSourceConfig for dynamic source configs'
    );
  }
  const bindings = Object.entries(env ?? {});
  const required = new Set();
  for (const [name, binding] of bindings) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      Object.hasOwn(CONTROL_ENV, name) ||
      !isRecord(binding) ||
      typeof binding.type !== 'string'
    ) {
      throw new Error(`Unsupported or reserved Worker binding ${name}`);
    }
    if (binding.type === 'secret') required.add(name);
  }
  if (!isRecord(secrets)) throw new Error('Expected a fixture secrets object');
  const missing = [...required].filter(
    (name) =>
      !Object.hasOwn(secrets, name) ||
      typeof secrets[name] !== 'string' ||
      !secrets[name].trim()
  );
  if (missing.length) {
    throw new Error(
      `Missing disposable fixtures for declared secrets: ${missing.join(', ')}`
    );
  }
  for (const name of Object.keys(secrets)) {
    if (!required.has(name))
      throw new Error(`Undeclared fixture secret ${name}`);
  }
  return bindings.map(([name]) => name);
}

async function importVite(root) {
  const require = createRequire(path.join(root, 'package.json'));
  return import(pathToFileURL(require.resolve('vite')).href);
}

// The plugin prefers .dev.vars/.env files over process env (preview resolves
// them from the cwd), so a developer's real secrets could replace the
// disposable fixtures. Refuse to start instead of reaching live services.
function assertNoLocalSecretFiles(root) {
  for (const directory of new Set([root, process.cwd()])) {
    const found = readdirSync(directory).filter(
      (name) =>
        /^\.(?:dev\.vars|env)(?:\..*)?$/.test(name) &&
        !name.endsWith('.example')
    );
    if (found.length)
      throw new Error(
        `Refusing to start with local secret files in ${directory}: ${found.join(', ')}`
      );
  }
}

function applySecrets(secrets, bindingNames) {
  const previous = new Map();
  const set = (name, value) => {
    if (!previous.has(name)) previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  // Declared secrets force process-env loading in the installed plugin, even
  // with INCLUDE_PROCESS_ENV=false. Mask bindings first to preserve defaults.
  for (const name of bindingNames) set(name, undefined);
  for (const [name, value] of Object.entries(CONTROL_ENV)) set(name, value);
  for (const [name, value] of Object.entries(secrets)) set(name, value);
  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/**
 * Start the Worker in workerd on a loopback port.
 * Calls sharing process.env must run serially until close completes. Source
 * configs must be static cf objects, or have an explicit loader returning the
 * resolved cf config used by the app. Build-output always reads emitted config.
 * @param {{ root: string, mode: 'source' | 'build-output', secrets?: Record<string, string>, loadSourceConfig?: (root: string) => Promise<object> }} options
 */
export async function startCfViteWorker({
  root,
  mode,
  secrets = {},
  loadSourceConfig = importSourceConfig,
}) {
  root = path.resolve(root);
  if (mode !== 'source' && mode !== 'build-output') {
    throw new Error(`Unknown Worker runtime mode ${mode}`);
  }
  if (
    mode === 'build-output' &&
    !existsSync(path.join(root, BUILD_OUTPUT_ROOT, 'config.json'))
  ) {
    throw new Error(`No cf Build Output under ${root}; build the Worker first`);
  }
  assertNoLocalSecretFiles(root);
  const config =
    mode === 'source'
      ? await loadSourceConfig(root)
      : readBuildOutputConfig(root);
  const bindingNames = validateFixtures(config, secrets);
  const restore = applySecrets(secrets, bindingNames);
  const shared = {
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
  };
  let server;
  let origin;
  try {
    const vite = await importVite(root);
    if (mode === 'source') {
      server = await vite.createServer({
        ...shared,
        server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
      });
      await server.listen();
    } else {
      server = await vite.preview({
        ...shared,
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
      });
    }
    const address = server.httpServer.address();
    origin = `http://127.0.0.1:${address.port}`;
  } catch (error) {
    try {
      await server?.close?.();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        'Worker startup and cleanup failed'
      );
    } finally {
      restore();
    }
    throw error;
  }
  return {
    origin,
    fetch: (pathname, init) => fetch(new URL(pathname, origin), init),
    async close() {
      try {
        await server.close();
      } finally {
        restore();
      }
    },
  };
}
