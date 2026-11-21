const assert = require('node:assert/strict');
const test = require('node:test');
const { identity, secretNames } = require('./verify-meet-start-output');
const {
  EMITTED_DEFAULTS,
  checkPolicy,
} = require('./meet-emitted-defaults.mjs');

const configPath = '/synthetic-original/.void-wrangler.jsonc';

function emitted() {
  return {
    ...structuredClone(identity),
    ...structuredClone(EMITTED_DEFAULTS),
    main: 'index.js',
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    secrets: { required: [...secretNames] },
    configPath,
    userConfigPath: configPath,
    topLevelName: identity.name,
    definedEnvironments: [],
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    upload_source_maps: true,
    dev: {
      ip: 'localhost',
      local_protocol: 'http',
      upstream_protocol: 'http',
      enable_containers: true,
      generate_types: false,
    },
  };
}

test('the sealed Meet identity binds the shared abuse guard', () => {
  assert.deepEqual(
    identity.services.filter((service) => service.binding === 'ABUSE_GUARD'),
    [
      {
        binding: 'ABUSE_GUARD',
        service: 'tuturuuu-abuse-guard',
        entrypoint: 'AbuseGuardEntrypoint',
      },
    ]
  );
  assert.ok(!secretNames.includes('ABUSE_GUARD_KEY_PEPPER'));
});

test('the emitted artifact assigns only the proxy family to the guard', () => {
  assert.equal(identity.vars.ABUSE_GUARD_FAMILIES, 'proxy');
  const config = emitted();
  checkPolicy(config, identity, secretNames);
  for (const value of [undefined, 'proxy,meet', 'proxy,password']) {
    const changed = structuredClone(config);
    if (value === undefined) delete changed.vars.ABUSE_GUARD_FAMILIES;
    else changed.vars.ABUSE_GUARD_FAMILIES = value;
    assert.throws(() => checkPolicy(changed, identity, secretNames));
  }
});
