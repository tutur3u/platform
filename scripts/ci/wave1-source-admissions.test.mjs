import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ABUSE_GUARD_SERVICE_BINDING,
  assertSourceResources,
  validateAdmittedSourceServices,
} from './wave1-source-admissions.mjs';
import { validateReleaseRecipe } from './release-recipe-config.mjs';

const policy = JSON.parse(
  readFileSync(new URL('./wave1-native-profiles.json', import.meta.url), 'utf8')
);

for (const app of ['nova', 'ai', 'rewise']) {
  test(`${app} release recipe validates on load`, () => {
    const recipe = validateReleaseRecipe(
      structuredClone(policy.apps[app].releaseRecipe)
    );
    assert.equal(recipe.app, app);
  });
}

test('nova admits the exact ABUSE_GUARD service binding', () => {
  const recipe = policy.apps.nova.releaseRecipe;
  assert.deepEqual(recipe.cf.admittedSourceServices, [
    ABUSE_GUARD_SERVICE_BINDING,
  ]);
  assert.doesNotThrow(() =>
    assertSourceResources({ services: [ABUSE_GUARD_SERVICE_BINDING] }, recipe)
  );
});

test('rewise admits the exact ABUSE_GUARD service binding', () => {
  const recipe = policy.apps.rewise.releaseRecipe;
  assertSourceResources({ services: [ABUSE_GUARD_SERVICE_BINDING] }, recipe);
});

test('nova allows TUTURUUU_REQUIRE_SECRETS in release vars', () => {
  assert.equal(
    policy.apps.nova.releaseRecipe.allowedVars.TUTURUUU_REQUIRE_SECRETS,
    '1'
  );
});

test('ai allows TUTURUUU_NOINDEX=1 in source and release vars', () => {
  const recipe = policy.apps.ai.releaseRecipe;
  assert.equal(recipe.allowedVars.TUTURUUU_NOINDEX, '1');
  assert.equal(recipe.cf.sourceVars.TUTURUUU_NOINDEX, '1');
});

for (const [label, app, mutate] of [
  [
    'a second calendar service',
    'calendar',
    (recipe) => {
      recipe.cf.admittedSourceServices = [
        ABUSE_GUARD_SERVICE_BINDING,
        { binding: 'OTHER', service: 'tuturuuu-other' },
      ];
    },
  ],
  [
    'tools',
    'tools',
    (recipe) => {
      recipe.allowedVars.TUTURUUU_REQUIRE_SECRETS = '1';
    },
  ],
  [
    'wrong abuse-guard service',
    'nova',
    (recipe) => {
      recipe.cf.admittedSourceServices = [
        {
          ...ABUSE_GUARD_SERVICE_BINDING,
          service: 'tuturuuu-abuse-guard-staging',
        },
      ];
    },
  ],
  [
    'ai noindex on tools',
    'tools',
    (recipe) => {
      recipe.allowedVars.TUTURUUU_NOINDEX = '1';
    },
  ],
])
  test(`rejects ${label}`, () => {
    const candidate = structuredClone(policy.apps[app].releaseRecipe);
    mutate(candidate);
    assert.throws(() => validateReleaseRecipe(candidate));
  });

test('rejects foreign service bindings during qualification', () => {
  const recipe = policy.apps.nova.releaseRecipe;
  assert.throws(() =>
    assertSourceResources(
      {
        services: [
          {
            binding: 'ABUSE_GUARD',
            service: 'tuturuuu-web',
            entrypoint: 'AbuseGuardEntrypoint',
          },
        ],
      },
      recipe
    )
  );
});

test('calendar admits exactly the shared abuse guard', () => {
  const recipe = policy.apps.calendar.releaseRecipe;
  assert.deepEqual(recipe.cf.admittedSourceServices, [
    ABUSE_GUARD_SERVICE_BINDING,
  ]);
  assert.equal(recipe.cf.sourceVars.ABUSE_GUARD_FAMILIES, 'proxy');
  assert.equal(recipe.allowedVars.ABUSE_GUARD_FAMILIES, 'proxy');
  assertSourceResources({ services: [ABUSE_GUARD_SERVICE_BINDING] }, recipe);
});

test('abuse-guard admissions stay limited to calendar, finance, nova and rewise', () => {
  assert.throws(() =>
    validateAdmittedSourceServices('ai', [ABUSE_GUARD_SERVICE_BINDING])
  );
});
