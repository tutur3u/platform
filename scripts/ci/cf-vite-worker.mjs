// Local Worker runtime harness for cf-migrated native Workers.
// It drives the same Cloudflare Vite plugin runtime that `cf dev` starts:
// `source` serves cloudflare.config.ts through the Vite dev server, while
// `build-output` previews the emitted .cloudflare/output/v0 artifact that
// `cf deploy --prebuilt` publishes. Both bind loopback only, disable remote
// bindings and persistence, and receive disposable secrets via process env.
import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUILD_OUTPUT_ROOT = path.join('.cloudflare', 'output', 'v0');

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

function applySecrets(secrets) {
  const previous = new Map();
  const set = (name, value) => {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  };
  // The plugin only forwards process env values for declared secrets/vars.
  set('CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV', 'true');
  set('CLOUDFLARE_INCLUDE_PROCESS_ENV', 'true');
  set('CLOUDFLARE_VITE_FORCE_LOCAL', 'true');
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
 * @param {{ root: string, mode: 'source' | 'build-output', secrets?: Record<string, string> }} options
 */
export async function startCfViteWorker({ root, mode, secrets = {} }) {
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
  const restore = applySecrets(secrets);
  const shared = {
    root,
    configFile: path.join(root, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
  };
  let server;
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
  } catch (error) {
    restore();
    await server?.close?.();
    throw error;
  }
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
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
