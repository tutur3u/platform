const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  manifestPin,
  sameContent,
} = require('./supabase-image-cache-registry.js');

const bytes = (value) => Buffer.from(JSON.stringify(value));
const digest = (value) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('qualification binds platform bytes and config while allowing different index metadata', () => {
  const config = `sha256:${'a'.repeat(64)}`;
  const platform = bytes({ config: { digest: config } });
  const index = bytes({
    manifests: [
      {
        platform: { os: 'linux', architecture: 'arm64' },
        digest: `sha256:${'b'.repeat(64)}`,
      },
      {
        platform: { os: 'linux', architecture: 'amd64' },
        digest: digest(platform),
      },
    ],
  });
  const pin = manifestPin(index, platform);
  assert.deepEqual(pin, {
    index: digest(index),
    amd64: digest(platform),
    config,
  });
  assert.equal(sameContent(pin, manifestPin(platform)), true);
  assert.equal(
    sameContent(pin, { ...pin, config: `sha256:${'c'.repeat(64)}` }),
    false
  );
  assert.equal(
    sameContent(pin, { ...pin, amd64: `sha256:${'d'.repeat(64)}` }),
    false
  );
  assert.throws(
    () =>
      manifestPin(index, bytes({ config: { digest: config }, changed: true })),
    /digest mismatch/
  );
  assert.throws(
    () => manifestPin(bytes({ manifests: [] })),
    /Missing linux\/amd64/
  );
  assert.throws(
    () => manifestPin(bytes({ config: {} })),
    /Missing registry config/
  );
});

test('CLI discovery requires all ten seed services and excludes disabled services and Postgres majors', () => {
  const { seedImages } = require('./supabase-image-cache-registry.js');
  const names = [
    'postgres',
    'kong',
    'mailpit',
    'postgrest',
    'postgres-meta',
    'studio',
    'imgproxy',
    'gotrue',
    'realtime',
    'storage-api',
  ];
  const source = names
    .map((name) => `FROM supplier/${name}:v1 AS ${name}`)
    .join('\n');
  assert.deepEqual(
    seedImages(
      `${source}\nFROM supabase/postgres:14 AS pg14\nFROM supabase/postgres:15 AS pg15\nFROM supabase/edge-runtime:v1 AS edgeruntime`
    ),
    names.map((name) => `supabase/${name}:v1`)
  );
  assert.throws(() => seedImages(''), /Incomplete/);
  assert.throws(
    () => seedImages(source.replace('FROM supplier/kong:v1 AS kong', '')),
    /Incomplete/
  );
  assert.throws(
    () => seedImages(`${source}\nFROM supplier/kong:v2 AS kong2`),
    /Duplicate/
  );
});
