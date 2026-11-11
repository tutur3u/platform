import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertRequiredWebSecrets,
  requiredWebSecrets,
} from './required-secrets.ts';

test('required issuer bindings have no development fallbacks', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const complete = {
      CF_ACCESS_TEAM_DOMAIN: 'fixture.cloudflareaccess.com',
      CF_ACCESS_AUD: 'fixture-audience',
    };
    assert.doesNotThrow(() => assertRequiredWebSecrets(complete));
    for (const name of requiredWebSecrets) {
      for (const value of [undefined, '', '   ']) {
        assert.throws(
          () => assertRequiredWebSecrets({ ...complete, [name]: value }),
          { message: `Missing required binding: ${name}` }
        );
      }
    }
    for (const mode of [undefined, '', 'development', 'test']) {
      if (mode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = mode;
      assert.throws(() => assertRequiredWebSecrets(complete), {
        message: 'Web Worker requires production mode',
      });
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
