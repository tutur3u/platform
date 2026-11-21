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
  assertServingGateway,
  captureGatewaySettings,
  deployConfig,
  familySpec,
  gatewayFamilies,
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
// Fixture: public-docs as an activated family (the committed table also
// activates it); `inactiveFamilies` clears every activation.
const activatedFamilies = {
  ...families,
  families: families.families.map((family) =>
    family.id === 'public-docs' ? { ...family, activated: true } : family
  ),
};
const inactiveFamilies = {
  ...families,
  families: families.families.map(
    ({ activated: _activated, ...family }) => family
  ),
};
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
// Every deploy requires the committed secret names on the live Worker.
const liveBase = [
  ...liveOrigins,
  { type: 'secret_text', name: 'TRUSTED_PROXY_ORIGIN_SECRET' },
];
const live = [
  ...liveBase,
  {
    type: 'plain_text',
    name: 'GATEWAY_MOUNTED_PATHS',
    text: '/learn,/learn/*',
  },
  { type: 'secret_text', name: 'GATEWAY_ACCEPTANCE_BYPASS_SECRET' },
  { type: 'service', name: 'MOUNT_LEARN', service: 'tuturuuu-learn' },
];

test('captures only the settings of the gateway version at 100% traffic', async () => {
  const deploymentId = '11111111-1111-4111-8111-111111111111';
  const serving = '22222222-2222-4222-8222-222222222222';
  const candidate = '33333333-3333-4333-8333-333333333333';
  const deployments = {
    deployments: [
      {
        id: deploymentId,
        versions: [
          { version_id: candidate, percentage: 0 },
          { version_id: serving, percentage: 100 },
        ],
      },
    ],
  };
  const requests = [];
  const request = async (resource) => {
    requests.push(resource);
    if (resource === '/deployments') return deployments;
    assert.equal(resource, `/versions/${serving}`);
    return { id: serving, resources: { bindings: live } };
  };
  const snapshot = await captureGatewaySettings(request);
  assert.deepEqual(snapshot.result, {
    deploymentId,
    versionId: serving,
    bindings: live,
  });
  assert.deepEqual(requests, [
    '/deployments',
    `/versions/${serving}`,
    '/deployments',
  ]);

  deployments.deployments[0].id = '44444444-4444-4444-8444-444444444444';
  await assert.rejects(
    assertServingGateway(snapshot.result, request),
    /advanced/
  );
  deployments.deployments[0].versions[0].percentage = 10;
  deployments.deployments[0].versions[1].percentage = 90;
  await assert.rejects(captureGatewaySettings(request), /exactly one.*100%/);
});

test('keeps live vars and services, sets origins and flagged family bindings', () => {
  const config = deployConfig(base, live, activatedFamilies, env);
  assert.equal(config.routes, undefined);
  assert.equal(config.name, 'tuturuuu-gateway');
  assert.equal(
    config.vars.GATEWAY_MOUNTED_PATHS,
    '/learn,/nova,/nova/*,/admin,/admin/*,/learn/*'
  );
  assert.equal(config.vars.WEB_ORIGIN, 'https://web.example.vercel.app');
  assert.equal(
    config.vars.MARKETING_ORIGIN,
    'https://marketing.example.workers.dev'
  );
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, 'public-docs');
  assert.equal(config.vars.GATEWAY_MODE, 'active');
  assert.equal(config.vars.GATEWAY_ACCEPTANCE_BYPASS_SECRET, undefined);
  assert.deepEqual(config.services, [
    { binding: 'MOUNT_ADMIN', service: 'tuturuuu-infrastructure' },
    { binding: 'MOUNT_LEARN', service: 'tuturuuu-learn' },
    { binding: 'MOUNT_NOVA', service: 'tuturuuu-nova' },
    { binding: 'WEB_FAMILY_PUBLIC_DOCS', service: 'tuturuuu-web-public-docs' },
  ]);
});

const withTools = {
  ...base,
  vars: { ...base.vars, GATEWAY_MOUNTED_PATHS: '/tools,/tools/*' },
  services: [{ binding: 'MOUNT_TOOLS', service: 'tuturuuu-tools' }],
};

test('admits committed mount paths and bindings alongside live ones', () => {
  const config = deployConfig(
    withTools,
    [
      ...liveBase,
      {
        type: 'plain_text',
        name: 'GATEWAY_MOUNTED_PATHS',
        text: '/tools,/learn/*',
      },
      { type: 'service', name: 'MOUNT_TOOLS', service: 'tuturuuu-tools' },
      {
        type: 'service',
        name: 'MOUNT_LEARN',
        service: 'tuturuuu-learn',
        environment: 'private',
        entrypoint: 'Mounted',
      },
    ],
    families,
    { ...env, GATEWAY_WEB_FAMILIES: '' }
  );
  assert.equal(config.vars.GATEWAY_MOUNTED_PATHS, '/tools,/tools/*,/learn/*');
  assert.deepEqual(config.services, [
    {
      binding: 'MOUNT_LEARN',
      service: 'tuturuuu-learn',
      environment: 'private',
      entrypoint: 'Mounted',
    },
    { binding: 'MOUNT_TOOLS', service: 'tuturuuu-tools' },
  ]);
});

test('treats the live default production environment as the committed binding', () => {
  const config = deployConfig(
    withTools,
    [
      ...liveBase,
      {
        type: 'service',
        name: 'MOUNT_TOOLS',
        service: 'tuturuuu-tools',
        environment: 'production',
      },
    ],
    families,
    { ...env, GATEWAY_WEB_FAMILIES: '' }
  );
  assert.deepEqual(
    config.services.find(({ binding }) => binding === 'MOUNT_TOOLS'),
    { binding: 'MOUNT_TOOLS', service: 'tuturuuu-tools' }
  );
});

test('refuses to change a live service claimed by the committed config', () => {
  assert.throws(
    () =>
      deployConfig(
        withTools,
        [
          ...liveBase,
          { type: 'service', name: 'MOUNT_TOOLS', service: 'other-worker' },
        ],
        families,
        env
      ),
    { message: 'Committed gateway service MOUNT_TOOLS differs from live' }
  );
});

test('refuses committed mounts without their paired binding or on the API path', () => {
  assert.throws(
    () => deployConfig({ ...withTools, services: [] }, live, families, env),
    { message: 'Committed gateway mount /tools requires MOUNT_TOOLS' }
  );
  assert.throws(
    () =>
      deployConfig(
        {
          ...withTools,
          vars: { ...base.vars, GATEWAY_MOUNTED_PATHS: '/api/*' },
        },
        live,
        families,
        env
      ),
    { message: 'Invalid committed gateway mount path: /api/*' }
  );
});

test('the committed family table activates only public-docs', () => {
  assert.deepEqual(
    families.families
      .filter((family) => family.activated === true)
      .map((family) => family.id),
    ['public-docs']
  );
});

test('a flagged family that is not activated is refused', () => {
  assert.throws(
    () => deployConfig(base, liveBase, inactiveFamilies, env),
    /not activated/u
  );
});

test('an empty flag list binds no family and routes nothing to one', () => {
  const config = deployConfig(base, liveBase, families, {
    ...env,
    GATEWAY_WEB_FAMILIES: '',
  });
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, '');
  assert.deepEqual(
    config.services.filter(({ binding }) => binding.startsWith('WEB_FAMILY_')),
    []
  );
});

test('refuses held or unknown families, bad origins and unknown binding types', () => {
  assert.throws(
    () =>
      deployConfig(base, liveBase, families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'dashboard-core',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () =>
      deployConfig(base, liveBase, families, {
        ...env,
        GATEWAY_WEB_FAMILIES: 'nope',
      }),
    /not an enabled family/u
  );
  assert.throws(
    () => deployConfig(base, liveBase, families, { ...env, WEB_ORIGIN: '' }),
    /https origin/u
  );
  assert.throws(
    () =>
      deployConfig(base, liveBase, families, {
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

test('requires the committed gateway secret names on the live Worker', () => {
  assert.deepEqual(requiredSecrets(base), ['TRUSTED_PROXY_ORIGIN_SECRET']);
  for (const bindings of [
    live.filter((binding) => binding.name !== 'TRUSTED_PROXY_ORIGIN_SECRET'),
    live.map((binding) =>
      binding.name === 'TRUSTED_PROXY_ORIGIN_SECRET'
        ? { type: 'plain_text', name: binding.name, text: '' }
        : binding
    ),
  ]) {
    assert.throws(() => deployConfig(base, bindings, families, env), {
      message:
        'Live gateway secret TRUSTED_PROXY_ORIGIN_SECRET is missing; set it before deploying.',
    });
  }
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

  const notEnabled = run({ ...env, GATEWAY_WEB_FAMILIES: 'api-identity' });
  assert.equal(notEnabled.status, 1);
  assert.equal(notEnabled.stdout, '');
  assert.equal(existsSync(out), false);

  const accepted = run({ ...env, GATEWAY_WEB_FAMILIES: '' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(
    accepted.stdout,
    'GATEWAY_WEB_FAMILIES=\nGATEWAY_ACCEPTANCE_HOST=unset\nVERCEL_PROTECTION_BYPASS=unset\n'
  );
  assert.equal(
    JSON.parse(readFileSync(out, 'utf8')).vars.WEB_ORIGIN,
    env.WEB_ORIGIN
  );
});

test('binds activated vinext families and refuses held ones', () => {
  const vinext = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/web/cloudflare/vinext/families.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  const merged = gatewayFamilies(families, vinext);
  const config = deployConfig(base, live, merged, {
    ...env,
    GATEWAY_WEB_FAMILIES: 'api-ops,api-core',
  });
  assert.equal(config.vars.GATEWAY_WEB_FAMILIES, 'api-ops,api-core');
  for (const [binding, service] of [
    ['WEB_FAMILY_API_OPS', 'tuturuuu-web-vinext-api-ops'],
    ['WEB_FAMILY_API_CORE', 'tuturuuu-web-vinext-api-core'],
  ]) {
    assert.deepEqual(
      config.services.find((entry) => entry.binding === binding),
      { binding, service }
    );
  }
  assert.throws(
    () =>
      deployConfig(
        base,
        live,
        gatewayFamilies(families, {
          ...vinext,
          families: vinext.families.map((family) =>
            family.id === 'dashboard' ? { ...family, activated: false } : family
          ),
        }),
        { ...env, GATEWAY_WEB_FAMILIES: 'api-ops,dashboard' }
      ),
    /not activated/
  );
  const enabledOpenNext = families.families.find((family) => family.enabled);
  assert.throws(
    () => gatewayFamilies(families, { families: [enabledOpenNext] }),
    /is enabled and also a vinext family/
  );
});

test('names the Worker and required secrets for OpenNext and vinext families', () => {
  const vinext = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/web/cloudflare/vinext/families.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  assert.deepEqual(familySpec('api-core', families, vinext), {
    worker: 'tuturuuu-web-vinext-api-core',
    required: vinext.requiredSecrets,
  });
  assert.ok(vinext.requiredSecrets.includes('SUPABASE_SECRET_KEY'));
  assert.equal(
    familySpec('public-docs', families, vinext).worker,
    'tuturuuu-web-public-docs'
  );
  assert.throws(
    () => familySpec('no-such-family', families, vinext),
    /no committed/
  );
  assert.throws(() => familySpec('a b', families, vinext), /invalid family id/);
});
