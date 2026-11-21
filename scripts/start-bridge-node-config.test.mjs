// Release acceptance loads each app's start-bridge.config.ts with Node's type
// stripping, outside any bundler. The bridge's app-config entry (and what it
// imports at load time) must therefore resolve in plain Node.
import assert from 'node:assert/strict';
import test from 'node:test';

const CONFIGS = ['learn', 'nova', 'teach', 'forms', 'git', 'ai', 'chat', 'cms'];

test('the app-config entry loads in plain Node', async () => {
  const module =
    await import('../packages/start-bridge/src/start/app-config.ts');
  assert.equal(typeof module.defineBridgeAppConfig, 'function');
  assert.equal(typeof module.withDocumentSecurity, 'function');
});

for (const app of CONFIGS) {
  test(`apps/${app}/start-bridge.config.ts loads in plain Node`, async () => {
    const { default: config } = await import(
      `../apps/${app}/start-bridge.config.ts`
    );
    assert.equal(typeof config, 'object');
  });
}
