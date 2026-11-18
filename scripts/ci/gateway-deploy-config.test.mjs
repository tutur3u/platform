import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const live = [
  {
    type: 'plain_text',
    name: 'GATEWAY_MOUNTED_PATHS',
    text: '/learn,/learn/*',
  },
  { type: 'plain_text', name: 'WEB_ORIGIN', text: 'https://stale.example' },
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
  const config = deployConfig(base, [], families, {
    ...env,
    GATEWAY_WEB_FAMILIES: '',
  });
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, '');
  assert.deepEqual(config.services, []);
});

test('refuses held or unknown families, bad origins and unknown binding types', () => {
  assert.throws(
    () =>
      deployConfig(base, [], families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'dashboard-core',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () =>
      deployConfig(base, [], families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'nope',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () => deployConfig(base, [], families, { ...env, WEB_ORIGIN: '' }),
    /https origin/u
  );
  assert.throws(
    () =>
      deployConfig(base, [], families, {
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
