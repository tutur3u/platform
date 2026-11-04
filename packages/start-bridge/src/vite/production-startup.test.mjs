import assert from 'node:assert/strict';
import test from 'node:test';
import { assertWorkerStartup } from '../server/startup.ts';
import { startBridgePreset } from './preset.ts';

const options = {
  appRoot: 'file:///repo/apps/mail/vite.config.ts',
  app: 'mail',
};
for (const env of [{}, { NODE_ENV: 'production' }])
  test(`shared server define inlines production with NODE_ENV ${env.NODE_ENV ?? 'unset'}`, () => {
    const preset = startBridgePreset(options, env);
    const define = preset.define['process.env.NODE_ENV'];
    assert.equal(define, '"production"');
    const source = 'return process.env.NODE_ENV === "production"';
    const compiled = source.replaceAll('process.env.NODE_ENV', define);
    assert.equal(new Function(compiled)(), true);
    assert.equal(
      JSON.parse(preset.clientDefine('build')['process.env']).NODE_ENV,
      'production'
    );
    assert.equal(preset.define['process.env'], undefined);
  });
test('explicit development remains available in the shared define', () => {
  assert.equal(
    startBridgePreset(options, { NODE_ENV: 'development' }).define[
      'process.env.NODE_ENV'
    ],
    '"development"'
  );
});
test('production startup refuses wrong or absent mode before serving', () => {
  for (const nodeEnv of ['', 'development', 'test'])
    assert.throws(
      () =>
        assertWorkerStartup({
          profile: 'production',
          env: {},
          requiredSecrets: [],
          nodeEnv,
        }),
      /NODE_ENV=production/
    );
});
test('startup requires each declared secret without fallbacks or value disclosure', () => {
  for (const value of [undefined, '', ' ', 123, null])
    assert.throws(
      () =>
        assertWorkerStartup({
          profile: 'production',
          env: { SIGNING_SECRET: value },
          requiredSecrets: ['SIGNING_SECRET'],
          nodeEnv: 'production',
        }),
      /^Error: Missing required Worker secret: SIGNING_SECRET$/
    );
  assert.throws(
    () =>
      assertWorkerStartup({
        profile: 'production',
        env: Object.create({ SIGNING_SECRET: 'inherited' }),
        requiredSecrets: ['SIGNING_SECRET'],
        nodeEnv: 'production',
      }),
    /SIGNING_SECRET/
  );
  assert.doesNotThrow(() =>
    assertWorkerStartup({
      profile: 'production',
      env: { SIGNING_SECRET: 'disposable-test-value' },
      requiredSecrets: ['SIGNING_SECRET'],
      nodeEnv: 'production',
    })
  );
  assert.throws(
    () =>
      assertWorkerStartup({
        profile: 'staging',
        env: {},
        requiredSecrets: ['SIGNING_SECRET'],
        nodeEnv: 'development',
      }),
    /SIGNING_SECRET/
  );
  assert.doesNotThrow(() =>
    assertWorkerStartup({
      profile: 'development',
      env: {},
      requiredSecrets: [],
      nodeEnv: 'development',
    })
  );
});
