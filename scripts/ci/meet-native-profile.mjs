import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNormalization, checkPolicy } from './meet-emitted-defaults.mjs';
import { sealMeetApp } from './meet-native-inventory.mjs';

const { validateOutput, verifyManifest, identity, secretNames } = createRequire(
  import.meta.url
)('./verify-meet-start-output.js');
export const PROFILE = 'meet-emitted-v1';
export const SUPPLIER = Object.freeze({
  wranglerVersion: '4.151.2',
  wranglerSha256:
    '507cd3644d6a53f0d66922d79c04b03557b7d2d0a376d2d906b92ed20812bb30',
  miniflareVersion: '5.20261019.0-beta',
  miniflareSha256:
    '309b8863f0f4c3050e173e945b4c696db8c330cdf3f35f0ecfd8417d75891eaa',
});
export const EDGES = Object.freeze(
  [
    ['app', 'ASSETS', 'assets', 'app:client'],
    ['app', 'MEET_LIVE', 'sqlite', 'app:MeetLiveDurableObject'],
    ['app', 'WORKER_SELF_REFERENCE', 'service', 'app:default'],
    ['app', 'NEXT_INC_CACHE_R2_BUCKET', 'local-r2', 'scratch'],
    ['app', 'IMAGES', 'local-images', 'scratch'],
    ['probe', 'LIVE', 'external-sqlite', 'app:MeetLiveDurableObject'],
    ['probe', 'PROVIDER', 'service', 'app:MeetingAIProvider'],
  ].map(Object.freeze)
);

export function closed(value, keys, label) {
  assert.equal(Object.getPrototypeOf(value ?? {}), Object.prototype, label);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), label);
}
export function within(root, path) {
  assert.ok(
    isAbsolute(root) && isAbsolute(path),
    'Absolute graph paths required'
  );
  const rel = relative(root, path);
  assert.ok(
    rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    'Graph path escapes root'
  );
  return path;
}
export function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const probePath = fileURLToPath(
  new URL('./meet-native-probe.mjs', import.meta.url)
);
export function probeConfig() {
  return {
    name: 'meet-ci-binding-probe',
    main: 'probe.mjs',
    compatibility_date: '2026-09-06',
    no_bundle: true,
    durable_objects: {
      bindings: [
        {
          name: 'LIVE',
          class_name: 'MeetLiveDurableObject',
          script_name: 'tuturuuu-meet',
        },
      ],
    },
    services: [
      {
        binding: 'PROVIDER',
        service: 'tuturuuu-meet',
        entrypoint: 'MeetingAIProvider',
      },
    ],
  };
}
export function admitProbe(config) {
  assert.deepEqual(config, probeConfig(), 'Unsupported probe config/edge');
}
export function admitApp(config, normalization) {
  checkPolicy(config, identity, secretNames);
  checkNormalization(config, normalization);
}
export function fixtureBindings(secret) {
  assert.match(secret, /^[a-f0-9-]{72}$/);
  return {
    MEET_REALTIME_TOKEN_SECRET: { type: 'secret_text', value: secret },
    SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
    NEXT_PUBLIC_SUPABASE_URL: {
      type: 'plain_text',
      value: 'https://meet-ci.supabase.invalid',
    },
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
      type: 'plain_text',
      value: 'sb_publishable_meet_ci_placeholder',
    },
    GOOGLE_GENERATIVE_AI_API_KEY: {
      type: 'secret_text',
      value: 'disposable-unused-fixture',
    },
  };
}

export async function inspectMeetGraph(options) {
  closed(
    options,
    ['appDirectory', 'sourceSHA', 'ownerPackage'],
    'Meet graph options'
  );
  const { appDirectory, sourceSHA, ownerPackage } = options;
  assert.match(sourceSHA, /^[a-f0-9]{40}$/);
  const app = await realpath(appDirectory);
  assert.equal(app, appDirectory, 'App root must be canonical');
  assert.equal(
    ownerPackage,
    join(app, 'package.json'),
    'SDK must resolve from Meet owner'
  );
  const artifact = validateOutput(app, {
    sha: sourceSHA,
    mode: 'restore-required',
  });
  const manifestPath = join(app, 'meet-artifact.json');
  assert.equal(await realpath(manifestPath), manifestPath);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  verifyManifest(app, manifest, sourceSHA);
  admitApp(artifact.config, manifest.normalization);
  const root = join(app, 'dist');
  const configRelative = relative(root, artifact.configPath);
  const assetsRelative = relative(root, artifact.assets);
  const seal = await sealMeetApp(root, { configRelative, assetsRelative });
  within(root, artifact.configPath);
  within(root, artifact.main);
  within(root, artifact.assets);
  const probeBytes = await readFile(probePath);
  assert.equal(await realpath(probePath), probePath);
  assert.equal(await realpath(ownerPackage), ownerPackage);
  const lockPath = join(dirname(dirname(app)), 'bun.lock');
  assert.equal(await realpath(lockPath), lockPath);
  return freeze({
    profile: PROFILE,
    sourceSHA,
    ownerPackage,
    ownerPackageHash: hash(await readFile(ownerPackage)),
    lockPath,
    lockHash: hash(await readFile(lockPath)),
    app,
    root,
    seal,
    config: artifact.config,
    configRelative,
    mainRelative: relative(root, artifact.main),
    assetsRelative,
    manifestPath,
    manifestHash: hash(manifestBytes),
    manifest,
    pointerPath: artifact.redirectPath,
    pointerHash: hash(await readFile(artifact.redirectPath)),
    probePath,
    probeHash: hash(probeBytes),
    probeConfig: probeConfig(),
    edges: structuredClone(EDGES),
    supplier: { ...SUPPLIER },
  });
}

export async function assertMeetOriginal(plan) {
  const current = await inspectMeetGraph({
    appDirectory: plan.app,
    sourceSHA: plan.sourceSHA,
    ownerPackage: plan.ownerPackage,
  });
  assert.deepEqual(current, plan, 'Original graph/config/probe/edge mutation');
}

export function admitRegistry(records, startedAt) {
  closed(
    records,
    ['tuturuuu-meet', 'meet-ci-binding-probe'],
    'Registry user roles'
  );
  const instances = new Set();
  for (const [name, { value, mtimeMs }] of Object.entries(records)) {
    closed(
      value,
      [
        'debugPortAddress',
        'defaultEntrypointService',
        'userWorkerService',
        'instanceId',
      ],
      'Registry record'
    );
    assert.match(value.debugPortAddress, /^127\.0\.0\.1:[1-9][0-9]{0,4}$/);
    assert.ok(Number(value.debugPortAddress.split(':')[1]) <= 65535);
    assert.equal(value.userWorkerService, `core:user:${name}`);
    assert.equal(
      value.defaultEntrypointService,
      name === 'tuturuuu-meet'
        ? `assets:rpc-proxy:${name}`
        : `core:user:${name}`
    );
    assert.equal(typeof value.instanceId, 'string');
    assert.ok(value.instanceId.length > 0 && value.instanceId.length < 128);
    assert.ok(mtimeMs >= startedAt, 'Stale registry record');
    instances.add(value.instanceId);
  }
  assert.equal(instances.size, 2, 'Independent SDK sessions required');
}
