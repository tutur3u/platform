import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readNativeRuntimeConfig } from './apps-native-runtime-pointer.mjs';
import { inventory } from './wave1-native-artifact.mjs';

const allowed = new Set(
  `name main assets account_id compatibility_date compatibility_flags vars workers_dev preview_urls observability no_bundle rules configPath userConfigPath topLevelName definedEnvironments jsx_factory jsx_fragment triggers durable_objects workflows migrations exports kv_namespaces cloudchamber send_email queues connect r2_buckets d1_databases vectorize ai_search_namespaces ai_search agent_memory hyperdrive services analytics_engine_datasets dispatch_namespaces mtls_certificates pipelines k2 secrets_store_secrets artifacts unsafe_hello_world flagship worker_loaders ratelimits vpc_services vpc_networks logfwdr python_modules dev upload_source_maps`.split(
    ' '
  )
);
function contained(root, path, directory = false) {
  const part = relative(root, path);
  assert.ok(
    part && !isAbsolute(part) && part !== '..' && !part.startsWith('../'),
    'Path outside dist'
  );
  assert.equal(realpathSync(path), path, 'Artifact symlink forbidden');
  assert.ok(
    directory ? lstatSync(path).isDirectory() : lstatSync(path).isFile(),
    'Unexpected artifact file type'
  );
  return path;
}
function receiptName(sha) {
  assert.match(sha, /^[a-f0-9]{40}$/u);
  return `cutover-receipt-${sha}.json`;
}
export function prepareCutover(root, app, sha) {
  assert.ok(['mail', 'apps'].includes(app));
  const name = receiptName(sha);
  root = realpathSync(root);
  const { configPath, config } = readNativeRuntimeConfig(root);
  for (const key of Object.keys(config))
    assert.ok(allowed.has(key), `Unreviewed emitted key: ${key}`);
  const dist = join(root, 'dist');
  assert.equal(typeof config.main, 'string');
  assert.equal(typeof config.assets?.directory, 'string');
  const main = contained(dist, resolve(dirname(configPath), config.main));
  const assets = contained(
    dist,
    resolve(dirname(configPath), config.assets.directory),
    true
  );
  assert.equal(assets, join(dist, 'client'));
  assert.equal(config.assets.binding, 'ASSETS');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  config.main = relative(dirname(configPath), main);
  config.assets.directory = relative(dirname(configPath), assets);
  delete config.configPath;
  delete config.userConfigPath;
  Object.assign(config, {
    name: `tuturuuu-${app}`,
    workers_dev: false,
    preview_urls: false,
    routes: [],
  });
  config.vars = {
    ...config.vars,
    NEXT_PUBLIC_APP_URL: `https://${app}.tuturuuu.com`,
    [`NEXT_PUBLIC_${app.toUpperCase()}_APP_URL`]: `https://${app}.tuturuuu.com`,
    NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com',
    TUTURUUU_NOINDEX: '0',
    ...(app === 'apps'
      ? {
          APPS_CANONICAL_HOST_ENABLED: '1',
          INTERNAL_WEB_API_ORIGIN: 'https://tuturuuu.com',
        }
      : { MAIL_R2_BUCKET_NAME: 'tuturuuu-mail' }),
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const receipt = {
    sourceSha: sha,
    worker: config.name,
    config: relative(root, configPath),
    productionRouteAttached: false,
    files: inventory(dist),
  };
  writeFileSync(join(root, name), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
export function packCutover(root, app, sha, output) {
  assert.ok(['mail', 'apps'].includes(app));
  const name = receiptName(sha);
  const receipt = JSON.parse(readFileSync(join(root, name), 'utf8'));
  assert.equal(receipt.sourceSha, sha);
  assert.equal(receipt.worker, `tuturuuu-${app}`);
  assert.deepEqual(
    inventory(join(root, 'dist')),
    receipt.files,
    'Sealed bytes changed'
  );
  mkdirSync(output, { recursive: true });
  const archive = resolve(output, `${app}-${sha}.tar.gz`);
  execFileSync('tar', ['-czf', archive, '-C', root, 'dist', name], {
    timeout: 60000,
  });
  assert.deepEqual(
    inventory(join(root, 'dist')),
    receipt.files,
    'Bytes changed during packing'
  );
  const digest = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  writeFileSync(`${archive}.sha256`, `${digest}  ${app}-${sha}.tar.gz\n`);
  writeFileSync(join(output, name), `${JSON.stringify(receipt, null, 2)}\n`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [mode, app, sha, output] = process.argv.slice(2);
  const root = resolve('apps', app);
  if (mode === 'prepare') prepareCutover(root, app, sha);
  else {
    assert.equal(mode, 'pack');
    packCutover(root, app, sha, output);
  }
}
