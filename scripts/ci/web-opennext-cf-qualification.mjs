import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_OUTPUT_PREFIX } from './cf-build-output-publisher.mjs';
import { readJsonc } from './gateway-deploy-config.mjs';
import { emitVoidCfOutput } from './void-cf-output.mjs';

const contentTypes = {
  'application/javascript+module': 'esm',
  'application/javascript': 'cjs',
  'application/wasm': 'wasm',
  'application/octet-stream': 'data',
  'text/plain': 'text',
  'application/source-map': 'sourcemap',
};

async function readUpload(uploadFile) {
  const body = readFileSync(uploadFile);
  const firstLine = body.subarray(0, 80).toString().split('\r\n')[0];
  const boundary = /^--([a-z0-9-]{1,70})$/iu.exec(firstLine)?.[1];
  assert.ok(boundary, 'invalid family upload boundary');
  const form = await new Response(body, {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }).formData();
  const metadata = form.getAll('metadata');
  assert.equal(metadata.length, 1, 'family upload must have one metadata part');
  assert.equal(typeof metadata[0], 'string', 'family metadata must be JSON');
  form.delete('metadata');
  return { main: JSON.parse(metadata[0]).main_module, form };
}

/** Convert the family size gate's upload body without compiling it again. */
export async function qualifyFamilyOutput({
  configPath,
  uploadFile,
  destination,
  sourceSha,
  worker,
  accountId,
  vars,
}) {
  const { $schema, ...source } = readJsonc(configPath);
  assert.match(
    sourceSha,
    /^[0-9a-f]{40}$/u,
    'expected an immutable source SHA'
  );
  assert.equal(source.name, worker, 'unexpected family Worker');
  assert.match(
    accountId,
    /^[0-9a-f]{32}$/u,
    'expected a Cloudflare account ID'
  );
  assert.equal(source.account_id, accountId, 'unexpected family account');
  assert.equal(source.workers_dev, false, 'family must be private');
  assert.equal(source.preview_urls, false, 'family must have no preview URL');
  assert.deepEqual(source.routes ?? [], [], 'family must be route-free');
  assert.deepEqual(
    source.migrations ?? [],
    [],
    'family must have no migrations'
  );

  const { main, form } = await readUpload(uploadFile);
  assert.match(
    main,
    /^[a-zA-Z0-9_-]+\.js$/u,
    'family entrypoint must be a JS module'
  );
  const scratch = mkdtempSync(join(tmpdir(), 'cf-family-upload-'));
  try {
    const expected = new Map();
    for (const [name, file] of form) {
      assert.ok(
        name
          .split('/')
          .every((part) => /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/u.test(part)),
        'unsafe family module path'
      );
      assert.ok(!expected.has(name), 'duplicate family upload part');
      assert.ok(file instanceof File, 'family module must be a file');
      const type = contentTypes[file.type];
      assert.ok(type, 'unsupported family upload part type');
      const path = join(scratch, name);
      const bytes = Buffer.from(await file.arrayBuffer());
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes, { flag: 'wx' });
      expected.set(name, {
        type,
        hash: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const config = join(scratch, 'cf-emitted-config.json');
    writeFileSync(
      config,
      JSON.stringify({
        ...source,
        main,
        no_bundle: true,
        assets: {
          ...source.assets,
          directory: resolve(dirname(configPath), source.assets.directory),
        },
        upload_source_maps: true,
      }),
      { flag: 'wx' }
    );
    const receipt = await emitVoidCfOutput({
      configPath: config,
      destination,
      sourceSha,
      vars,
    });
    const prefix = `${BUILD_OUTPUT_PREFIX}workers/default/bundle/`;
    const actual = new Map(
      Object.entries(receipt.workerConfig.manifest.modules).map(
        ([name, { type }]) => [
          name,
          { type, hash: receipt.files[`${prefix}${name}`] },
        ]
      )
    );
    assert.deepEqual(actual, expected, 'family upload inventory differs');
    return receipt;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [family, configPath, uploadFile, destination] = process.argv.slice(2);
  assert.match(family ?? '', /^[a-z][a-z0-9-]*$/u, 'invalid family ID');
  const {
    GITHUB_SHA: sourceSha = '',
    CLOUDFLARE_ACCOUNT_ID: accountId = '',
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL,
    ROOT_WORKSPACE_ID,
  } = process.env;
  const vars = {
    PLATFORM_BUILD_COMMIT_HASH: sourceSha,
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_URL,
    ROOT_WORKSPACE_ID,
  };
  for (const [key, value] of Object.entries(vars))
    assert.ok(value, `missing family deploy input ${key}`);
  await qualifyFamilyOutput({
    configPath,
    uploadFile,
    destination,
    sourceSha,
    worker: `tuturuuu-web-${family}`,
    accountId,
    vars,
  });
}
