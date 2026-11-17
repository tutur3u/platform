import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateReleaseRecipe } from './release-recipe-config.mjs';
const record = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
).apps.finance.releaseRecipe;
test('Finance recipe accepts its public production inputs', () => {
  assert.equal(validateReleaseRecipe(structuredClone(record)).app, 'finance');
});
for (const [label, mutate] of [
  [
    'unknown field',
    (r) => {
      r.extra = true;
    },
  ],
  [
    'nested unknown field',
    (r) => {
      r.cf.extra = true;
    },
  ],
  [
    'wildcard',
    (r) => {
      r.canonicalHosts = ['https://*.example.com'];
    },
  ],
  [
    'HTTP',
    (r) => {
      r.canonicalHosts = ['http://finance.tuturuuu.com'];
    },
  ],
  [
    'staging',
    (r) => {
      r.allowedVars.NEXT_PUBLIC_APP_URL = 'https://finance.tutur3u.com';
    },
  ],
  [
    'secret var',
    (r) => {
      r.allowedVars.SUPABASE_SECRET_KEY = 'redacted';
    },
  ],
])
  test(`rejects ${label}`, () => {
    const candidate = structuredClone(record);
    mutate(candidate);
    assert.throws(() => validateReleaseRecipe(candidate));
  });

test('recipe and nested bindings are immutable', () => {
  const candidate = validateReleaseRecipe(structuredClone(record));
  assert.throws(() => {
    candidate.allowedVars.FINANCE_APP_URL = 'https://example.com';
  });
});
for (const [label, mutate] of [
  [
    'unknown build field',
    (r) => {
      r.buildRecipe.extra = true;
    },
  ],
  [
    'unknown smoke field',
    (r) => {
      r.smokeSpec.cases[0].extra = true;
    },
  ],
  [
    'unbounded smoke',
    (r) => {
      r.smokeSpec.maxRequests = 100000;
    },
  ],
  [
    'invalid date',
    (r) => {
      r.cf.compatibilityDate = '2026-02-30';
    },
  ],
  [
    'credentials in origin',
    (r) => {
      r.canonicalHosts = ['https://user:pass@example.com'];
    },
  ],
  [
    'secret overlap',
    (r) => {
      r.requiredSecretNames.push('FINANCE_APP_URL');
    },
  ],
])
  test(`rejects ${label}`, () => {
    const candidate = structuredClone(record);
    mutate(candidate);
    assert.throws(() => validateReleaseRecipe(candidate));
  });

test('Finance build command matches the committed package and Void config', async () => {
  const { assertCommittedRecipe } = await import('./release-recipe-config.mjs');
  assertCommittedRecipe(validateReleaseRecipe(structuredClone(record)));
  const candidate = structuredClone(record);
  candidate.buildRecipe.command = 'unreviewed-command';
  assert.throws(() => assertCommittedRecipe(candidate));
});

for (const app of ['calendar', 'mail', 'apps']) {
  test(`${app} recipe matches its committed native build`, async () => {
    const { profiles } = await import('./wave1-native-profile.mjs');
    const { assertCommittedRecipe } =
      await import('./release-recipe-config.mjs');
    const recipe = validateReleaseRecipe(
      structuredClone(profiles.apps[app].releaseRecipe)
    );
    assert.equal(recipe.app, app);
    assertCommittedRecipe(recipe);
  });
}
for (const [label, mutate] of [
  [
    'source secret binding',
    (r) => {
      r.cf.sourceVars.SUPABASE_SECRET_KEY = 'redacted';
    },
  ],
  [
    'unknown template',
    (r) => {
      r.cf.stagingPublicationVars.TEST_ORIGIN = 'https://{{unknown}}';
    },
  ],
  [
    'production staging flag',
    (r) => {
      r.allowedVars.TUTURUUU_NOINDEX = '1';
    },
  ],
])
  test(`rejects ${label}`, () => {
    const candidate = structuredClone(record);
    mutate(candidate);
    assert.throws(() => validateReleaseRecipe(candidate));
  });

const policy = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
);
for (const [label, change] of [
  [
    'Finance record edit changes emitted vars',
    (r) => {
      r.allowedVars.FINANCE_FEATURE = 'on';
    },
  ],
  [
    'credential key',
    (r) => {
      r.allowedVars.CONNECTED_ACCOUNTS_KEY = 'value';
    },
  ],
  [
    'JWT key',
    (r) => {
      r.allowedVars.SESSION_JWT = 'value';
    },
  ],
  [
    'foreign canonical host',
    (r) => {
      r.canonicalHosts = ['https://calendar.tuturuuu.com.evil.example'];
    },
  ],
  [
    'backslash smoke host',
    (r) => {
      r.smokeSpec.cases[0].path = '/\\evil.example';
    },
  ],
  [
    'encoded smoke host',
    (r) => {
      r.smokeSpec.cases[0].path = '/%2fexample.com';
    },
  ],
  [
    'scheme-relative var',
    (r) => {
      r.allowedVars.FINANCE_APP_URL = '//evil.example';
    },
  ],
  [
    'non-HTTPS var',
    (r) => {
      r.allowedVars.FINANCE_APP_URL = 'http:evil.example';
    },
  ],
])
  test(`review regression: ${label}`, () => {
    const candidate = structuredClone(record);
    change(candidate);
    assert.throws(() => validateReleaseRecipe(candidate));
  });
test('Calendar staging rejects the production apex and arbitrary hosts', () => {
  for (const value of [
    'https://tuturuuu.com',
    'https://evil.example',
    'http://web.tutur3u.com',
  ]) {
    const candidate = structuredClone(policy.apps.calendar.releaseRecipe);
    candidate.cf.stagingPublicationVars.NEXT_PUBLIC_WEB_APP_URL = value;
    assert.throws(() => validateReleaseRecipe(candidate));
  }
});
test('legacy secrets and identities are independently cross-checked', async () => {
  const { assertRecipeSettings } = await import('./release-recipe-config.mjs');
  for (const change of [
    (s) => s.secrets.push('NEW_REQUIRED_SECRET'),
    (s) => {
      s.canonicalHost = 'other.tuturuuu.com';
    },
    (s) => {
      s.compatibilityDate = '2026-01-01';
    },
  ]) {
    const settings = structuredClone(policy.apps.finance);
    change(settings);
    assert.throws(() => assertRecipeSettings(settings, settings.releaseRecipe));
  }
});
