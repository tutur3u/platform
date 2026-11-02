import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reserved = [
  'www',
  'ingest',
  'mastermind-hub',
  'mastermind-hub-staging',
  'iris-relay',
  'iris-relay-staging',
  'cf-bounce',
  '_dmarc',
  '_vercel',
  'docs',
];
function assertStagingHost(host) {
  assert.match(host, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tutur3u\.com$/u);
  assert.ok(
    !reserved.includes(host.split('.')[0]),
    `Reserved staging host: ${host}`
  );
}
const run = (code) =>
  JSON.parse(
    execFileSync('bun', ['--eval', code], {
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        CALENDAR_DEPLOYMENT_PROFILE: 'staging',
        FINANCE_DEPLOYMENT_PROFILE: 'staging',
      },
    })
  );

test('every staging profile and configured root host respects the zone reservation', () => {
  const profiles = JSON.parse(
    readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
  );
  for (const profile of [...Object.values(profiles.apps), profiles.webStaging])
    if (profile.stagingHost) assertStagingHost(profile.stagingHost);
  const loaded = run(`
    import { Glob } from 'bun';
    import { stagingApps, stagingHost, stagingWebOrigin } from './scripts/wave1-staging/profiles.ts';
    const hosts = [...stagingApps.map(stagingHost), new URL(stagingWebOrigin).hostname];
    for (const file of new Glob('apps/*/cloudflare/profile.ts').scanSync('.')) {
      const mod = await import('./' + file);
      if (mod.stagingProfile) hosts.push(mod.stagingProfile.host);
    }
    for (const file of new Glob('apps/*/start-bridge.config.ts').scanSync('.')) {
      const mod = await import('./' + file);
      for (const host of mod.default?.mounts?.rootHosts ?? []) {
        if (host.includes('*') || host.endsWith('.tutur3u.com') || host.includes('staging.')) hosts.push(host);
      }
    }
    console.log(JSON.stringify(hosts));
  `);
  for (const host of loaded) assertStagingHost(host);
  const finance = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/finance/cloudflare/native-profiles.json',
        import.meta.url
      )
    )
  );
  assertStagingHost(finance.staging.rootHost);
});

test('reserved production services, apex, wildcards, nested and legacy hosts fail closed', () => {
  for (const host of [
    'tutur3u.com',
    ...reserved.map((name) => `${name}.tutur3u.com`),
    'key._domainkey.tutur3u.com',
    '*.tutur3u.com',
    '*.docs.tutur3u.com',
    'tools.staging.tutur3u.com',
    'calendar-staging.tuturuuu.com',
    'foo.example.tutur3u.com',
  ])
    assert.throws(() => assertStagingHost(host), host);
  const denied = run(`
    import { isStagingAppHostname, isStagingAppOrigin } from './packages/utils/src/staging-hosts.ts';
    const hosts = ${JSON.stringify(['tutur3u.com', ...reserved.map((name) => `${name}.tutur3u.com`), 'key._domainkey.tutur3u.com'])};
    console.log(JSON.stringify(hosts.filter(host => isStagingAppHostname(host) || isStagingAppOrigin('https://' + host))));
  `);
  assert.deepEqual(denied, []);
});
