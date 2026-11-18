import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  deployConfig,
  familyBinding,
  parseFlagged,
  readJsonc,
  requiredSecrets,
} from './gateway-deploy-config.mjs';

const base = readJsonc(
  new URL('../../apps/gateway/wrangler.jsonc', import.meta.url)
);
const families = JSON.parse(
  readFileSync(
    new URL(
      '../../apps/web/cloudflare/opennext/families.json',
      import.meta.url
    ),
    'utf8'
  )
);
const env = {
  WEB_ORIGIN: 'https://web.example.vercel.app',
  MARKETING_ORIGIN: 'https://marketing.example.workers.dev',
  GATEWAY_WEB_FAMILIES: 'public-docs',
};
const liveOrigins = ['WEB_ORIGIN', 'MARKETING_ORIGIN'].map((name) => ({
  type: 'plain_text',
  name,
  text: env[name],
}));
const live = [
  ...liveOrigins,
  {
    type: 'plain_text',
    name: 'GATEWAY_MOUNTED_PATHS',
    text: '/learn,/learn/*',
  },
  { type: 'secret_text', name: 'GATEWAY_ACCEPTANCE_BYPASS_SECRET' },
  { type: 'service', name: 'MOUNT_LEARN', service: 'tuturuuu-learn' },
];

test('keeps live vars and services, sets origins and flagged family bindings', () => {
  const config = deployConfig(base, live, families, env);
  assert.equal(config.routes, undefined);
  assert.equal(config.name, 'tuturuuu-gateway');
  assert.equal(config.vars.GATEWAY_MOUNTED_PATHS, '/learn,/learn/*');
  assert.equal(config.vars.WEB_ORIGIN, 'https://web.example.vercel.app');
  assert.equal(
    config.vars.MARKETING_ORIGIN,
    'https://marketing.example.workers.dev'
  );
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, 'public-docs');
  assert.equal(config.vars.GATEWAY_MODE, 'active');
  assert.equal(config.vars.GATEWAY_ACCEPTANCE_BYPASS_SECRET, undefined);
  assert.deepEqual(config.services, [
    { binding: 'MOUNT_LEARN', service: 'tuturuuu-learn' },
    { binding: 'WEB_FAMILY_PUBLIC_DOCS', service: 'tuturuuu-web-public-docs' },
  ]);
});

test('an empty flag list binds no family and routes nothing to one', () => {
  const config = deployConfig(base, liveOrigins, families, {
    ...env,
    GATEWAY_WEB_FAMILIES: '',
  });
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, '');
  assert.deepEqual(config.services, []);
});

test('refuses held or unknown families, bad origins and unknown binding types', () => {
  assert.throws(
    () =>
      deployConfig(base, liveOrigins, families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'dashboard-core',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () =>
      deployConfig(base, liveOrigins, families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'nope',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () => deployConfig(base, liveOrigins, families, { ...env, WEB_ORIGIN: '' }),
    /https origin/u
  );
  assert.throws(
    () =>
      deployConfig(base, liveOrigins, families, {
        ...env,
        MARKETING_ORIGIN: 'http://x.example',
      }),
    /https origin/u
  );
  assert.throws(
    () =>
      deployConfig(base, [{ type: 'kv_namespace', name: 'KV' }], families, env),
    /kv_namespace/u
  );
  assert.throws(
    () =>
      deployConfig(
        base,
        [{ type: 'secret_text', name: 'WEB_ORIGIN' }],
        families,
        env
      ),
    /live gateway secret/u
  );
});

test('names bindings and parses the flag list', () => {
  assert.equal(familyBinding('api-identity'), 'WEB_FAMILY_API_IDENTITY');
  assert.deepEqual(parseFlagged(' public-docs, ,api-identity,public-docs'), [
    'public-docs',
    'api-identity',
  ]);
  assert.deepEqual(requiredSecrets({}), []);
  assert.deepEqual(requiredSecrets({ secrets: { required: ['A'] } }), ['A']);
});

test('refuses changed, missing, or ambiguous live origins by name only', () => {
  for (const { name } of liveOrigins) {
    const without = live.filter((binding) => binding.name !== name);
    for (const bindings of [
      without,
      [...live, { type: 'plain_text', name, text: env[name] }],
      [...without, { type: 'plain_text', name, text: 'https://other.example' }],
    ]) {
      assert.throws(() => deployConfig(base, bindings, families, env), {
        message: `${name} differs from live`,
      });
    }
  }
});

test('refuses forbidden bindings in committed config, live settings, or deploy env', () => {
  for (const name of ['GATEWAY_ACCEPTANCE_HOST', 'VERCEL_PROTECTION_BYPASS']) {
    const attempts = [
      () =>
        deployConfig(
          { ...base, vars: { ...base.vars, [name]: '' } },
          live,
          families,
          env
        ),
      () =>
        deployConfig(
          { ...base, secrets: { required: [name] } },
          live,
          families,
          env
        ),
      () =>
        deployConfig(
          base,
          [...live, { name, type: 'secret_text' }],
          families,
          env
        ),
      () =>
        deployConfig(
          base,
          [...live, { name, type: 'plain_text', text: '' }],
          families,
          env
        ),
      () => deployConfig(base, live, families, { ...env, [name]: '' }),
    ];
    for (const attempt of attempts) {
      assert.throws(attempt, { message: `${name} is set` });
    }
  }
});

test('write returns a name-only readback and fails before creating forbidden output', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-deploy-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const settings = join(dir, 'settings.json');
  const out = join(dir, 'deploy.json');
  const cli = fileURLToPath(
    new URL('./gateway-deploy-config.mjs', import.meta.url)
  );
  writeFileSync(
    settings,
    JSON.stringify({ success: true, result: { bindings: live } })
  );
  const run = (deployEnv) =>
    spawnSync(process.execPath, [cli, 'write', settings, out], {
      encoding: 'utf8',
      env: deployEnv,
    });

  const refused = run({ ...env, VERCEL_PROTECTION_BYPASS: 'fixture-value' });
  assert.equal(refused.status, 1);
  assert.equal(refused.stdout, '');
  assert.equal(refused.stderr, 'VERCEL_PROTECTION_BYPASS is set\n');
  assert.equal(existsSync(out), false);

  const accepted = run(env);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(
    accepted.stdout,
    'GATEWAY_WEB_FAMILIES=public-docs\nGATEWAY_ACCEPTANCE_HOST=unset\nVERCEL_PROTECTION_BYPASS=unset\n'
  );
  assert.equal(
    JSON.parse(readFileSync(out, 'utf8')).vars.WEB_ORIGIN,
    env.WEB_ORIGIN
  );
});
