import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertAllowedNoindex,
  assertProductionOnlyVars,
  allowsNonSecretVarName,
  validateAdmittedSourceServices,
} from './wave1-source-admissions.mjs';

export function closedRecord(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  for (const key of Object.keys(value))
    assert.ok(keys.includes(key), `Unknown field: ${key}`);
  for (const key of keys)
    assert.ok(Object.hasOwn(value, key), `Missing field: ${key}`);
}
export const credentialName =
  /KEY|CREDENTIAL|JWT|PASSWORD|TOKEN|SECRET|PRIVATE|COOKIE|SESSION|AUTH|PASS|CERT|SIGN|DSN/i;
const domain = (host, suffix) => host === suffix || host.endsWith(`.${suffix}`);
export function productionOrigin(value, pinned = false) {
  assert.equal(typeof value, 'string');
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.origin, value);
  assert.ok(!url.username && !url.password && !value.includes('*'));
  assert.ok(!/staging|tutur3u\.com|fxefojytwimjiqxseqag/i.test(value));
  assert.ok(
    domain(url.hostname, 'tuturuuu.com') ||
      (pinned && url.hostname === 'nzamlzqfdwaaxdefwraj.supabase.co'),
    'Unadmitted host'
  );
  return value;
}
function strings(values, pattern) {
  assert.ok(Array.isArray(values));
  assert.equal(new Set(values).size, values.length);
  for (const value of values) {
    assert.equal(typeof value, 'string');
    assert.match(value, pattern);
  }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function validateReleaseRecipe(record, { validateVercelSection } = {}) {
  assert.ok(['cf-wave1', 'vercel'].includes(record?.platform));
  const section = record.platform === 'cf-wave1' ? 'cf' : 'vercel';
  closedRecord(record, [
    'schemaVersion',
    'app',
    'platform',
    'canonicalHosts',
    'mountHosts',
    'buildRecipe',
    'requiredSecretNames',
    'allowedVars',
    'publicInputPins',
    'smokeSpec',
    'publicationPolicyKey',
    'rollbackTargetRule',
    section,
  ]);
  assert.equal(record.schemaVersion, 1);
  assert.match(record.app, /^[a-z][a-z0-9-]*$/);
  assert.equal(record.rollbackTargetRule, 'recorded-preimage');
  assert.equal(record.publicationPolicyKey, 'productionPublicationPolicy');
  for (const hosts of [
    record.canonicalHosts,
    record.mountHosts,
    record.publicInputPins,
  ]) {
    strings(hosts, /^https:\/\//);
    hosts.forEach((value) =>
      productionOrigin(value, hosts === record.publicInputPins)
    );
  }
  assert.ok(record.canonicalHosts.length > 0);
  strings(record.requiredSecretNames, /^[A-Z][A-Z0-9_]*$/);
  assert.ok(
    record.allowedVars &&
      typeof record.allowedVars === 'object' &&
      !Array.isArray(record.allowedVars)
  );
  for (const [name, value] of Object.entries(record.allowedVars)) {
    assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    assert.ok(!record.requiredSecretNames.includes(name));
    assert.ok(
      !credentialName.test(name) || allowsNonSecretVarName(record.app, name)
    );
    assert.equal(typeof value, 'string');
    assert.ok(!/staging|tutur3u\.com|fxefojytwimjiqxseqag/i.test(value));
    if (value.includes(':') || value.startsWith('//')) {
      const url = new URL(value);
      assert.ok(!url.username && !url.password);
      assert.equal(url.protocol, 'https:');
      productionOrigin(url.origin, record.publicInputPins.includes(url.origin));
    }
  }
  assertAllowedNoindex(record.app, record.allowedVars);
  closedRecord(record.buildRecipe, ['appConfig', 'script', 'command']);
  assert.equal(
    record.buildRecipe.appConfig,
    `apps/${record.app}/${record.platform === 'cf-wave1' ? 'void.config.ts' : 'vercel.json'}`
  );
  assert.match(record.buildRecipe.script, /^[a-z][a-z0-9:-]*$/);
  assert.equal(typeof record.buildRecipe.command, 'string');
  assert.ok(record.buildRecipe.command.length > 0);
  closedRecord(record.smokeSpec, ['maxRequests', 'timeoutMs', 'cases']);
  assert.ok(
    Number.isInteger(record.smokeSpec.maxRequests) &&
      record.smokeSpec.maxRequests > 0 &&
      record.smokeSpec.maxRequests <= 20
  );
  assert.ok(
    Number.isInteger(record.smokeSpec.timeoutMs) &&
      record.smokeSpec.timeoutMs > 0 &&
      record.smokeSpec.timeoutMs <= 60000
  );
  assert.ok(
    Array.isArray(record.smokeSpec.cases) &&
      record.smokeSpec.cases.length > 0 &&
      record.smokeSpec.cases.length <= record.smokeSpec.maxRequests
  );
  for (const item of record.smokeSpec.cases) {
    closedRecord(item, ['path', 'status', 'redirectOrigin', 'noStore']);
    assert.match(item.path, /^\/(?![/\\])[^\s#]*$/);
    assert.ok(!/\\|%2f|%5c|\.\./i.test(item.path));
    const origin = record.canonicalHosts[0];
    assert.equal(new URL(item.path, origin).origin, origin);
    assert.ok(
      Number.isInteger(item.status) && item.status >= 200 && item.status <= 599
    );
    if (item.redirectOrigin !== null) productionOrigin(item.redirectOrigin);
    assert.equal(typeof item.noStore, 'boolean');
  }
  if (section === 'vercel') {
    assert.equal(
      typeof validateVercelSection,
      'function',
      'Vercel validator required'
    );
    validateVercelSection(record.vercel);
  } else {
    closedRecord(record.cf, [
      'productionWorker',
      'compatibilityDate',
      'compatibilityFlags',
      'sourceIdentity',
      'productionOnly',
      'doctorExpectations',
      'sourceVars',
      'stagingPublicationVars',
      'admittedSourceServices',
    ]);
    for (const vars of [
      record.cf.sourceVars,
      record.cf.stagingPublicationVars,
    ]) {
      assert.ok(vars && typeof vars === 'object' && !Array.isArray(vars));
      for (const [name, value] of Object.entries(vars)) {
        assert.match(name, /^[A-Z][A-Z0-9_]*$/);
        assert.ok(
          !credentialName.test(name) || allowsNonSecretVarName(record.app, name)
        );
        assert.equal(typeof value, 'string');
        assert.ok(!value.replaceAll('{{host}}', '').includes('{{'));
      }
    }
    validateAdmittedSourceServices(
      record.app,
      record.cf.admittedSourceServices ?? []
    );
    if (record.cf.productionOnly) {
      assertProductionOnlyVars(
        record.app,
        record.allowedVars,
        record.cf.sourceVars
      );
    }
    for (const [name, value] of Object.entries(
      record.cf.stagingPublicationVars
    )) {
      const normalized = value.trim().toLowerCase();
      assert.ok(
        !normalized.includes('tuturuuu.com'),
        'Production value in staging'
      );
      if (
        !normalized.includes(':') &&
        !normalized.startsWith('//') &&
        (normalized.includes('.') || /(?:URL|ORIGIN|HOST|DOMAIN)$/.test(name))
      ) {
        const host = normalized.replace(/^\./, '').replace(/\.$/, '');
        assert.ok(
          /^[a-z0-9.-]+$/.test(host) && domain(host, 'tutur3u.com'),
          'Unadmitted staging host'
        );
      }
      if (value.includes(':') || value.startsWith('//')) {
        const url = new URL(
          value.replaceAll('{{host}}', 'fixture.tutur3u.com')
        );
        assert.equal(url.protocol, 'https:');
        assert.ok(!url.username && !url.password && !value.includes('*'));
        assert.ok(
          domain(url.hostname, 'tutur3u.com'),
          'Staging URL must use staging hosts'
        );
      }
    }
    assert.match(record.cf.productionWorker, /^[a-z][a-z0-9-]*$/);
    assert.ok(!record.cf.productionWorker.includes('staging'));
    assert.match(record.cf.compatibilityDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      new Date(record.cf.compatibilityDate).toISOString().slice(0, 10),
      record.cf.compatibilityDate
    );
    strings(record.cf.compatibilityFlags, /^[a-z][a-z0-9_]*$/);
    assert.equal(typeof record.cf.productionOnly, 'boolean');
    assert.match(record.cf.sourceIdentity, /^[a-z][a-z0-9-]*$/);
    closedRecord(record.cf.doctorExpectations, ['expectRedirect']);
    assert.equal(typeof record.cf.doctorExpectations.expectRedirect, 'boolean');
  }
  return freeze(record);
}

export function assertCommittedRecipe(
  record,
  root = new URL('../../', import.meta.url)
) {
  const read = (path) => readFileSync(new URL(path, root), 'utf8');
  const manifest = JSON.parse(read(`apps/${record.app}/package.json`));
  assert.equal(
    manifest.scripts[record.buildRecipe.script],
    record.buildRecipe.command,
    'Committed build recipe differs'
  );
  const config = read(record.buildRecipe.appConfig);
  if (record.platform === 'cf-wave1') {
    assert.ok(
      config.includes(`compatibility_date: '${record.cf.compatibilityDate}'`)
    );
  }
}

export function assertRecipeSettings(settings, recipe) {
  const extras = { calendar: ['GOOGLE_REDIRECT_URI'] };
  assert.deepEqual(
    recipe.requiredSecretNames,
    [...settings.secrets, ...(extras[recipe.app] ?? [])],
    'Profile secret lists differ'
  );
  assert.equal(
    settings.canonicalHost,
    new URL(recipe.canonicalHosts[0]).hostname
  );
  assert.equal(
    recipe.cf.productionWorker,
    settings.productionWorker,
    'Legacy production Worker differs'
  );
  for (const [legacy, value] of [
    ['productionOnly', recipe.cf.productionOnly],
    ['compatibilityDate', recipe.cf.compatibilityDate],
    ['sourceVars', recipe.cf.sourceVars],
  ]) {
    if (Object.hasOwn(settings, legacy))
      assert.deepEqual(settings[legacy], value, `Legacy ${legacy} differs`);
  }
}
