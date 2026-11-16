import assert from 'node:assert/strict';
import test from 'node:test';
import { assertStartupEnvironment } from './startup.mjs';

test('guest Worker needs only ASSETS and no credentials', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.doesNotThrow(() =>
      assertStartupEnvironment({ ASSETS: { fetch() {} } })
    );
    assert.throws(() => assertStartupEnvironment({}), /ASSETS/);
    assert.throws(() => assertStartupEnvironment({ ASSETS: {} }), /ASSETS/);
    process.env.NODE_ENV = 'development';
    assert.throws(
      () => assertStartupEnvironment({ ASSETS: { fetch() {} } }),
      /production/
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
