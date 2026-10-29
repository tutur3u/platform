import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  hostedStagingProfile,
  stagingApps,
  stagingBuildInputs,
} from './profiles.ts';
import { stagingRequest, stagingResponse } from './response.ts';

for (const app of stagingApps) {
  test(`${app}: exact staging route, isolated resources and cookie boundary`, () => {
    const profile = hostedStagingProfile(app, {
      ref: 's'.repeat(20),
    }).cloudflare;
    const host = `${app}.staging.tutur3u.com`;
    assert.equal(profile.name, `tuturuuu-${app}-hosted-staging`);
    assert.deepEqual(profile.routes, [
      { pattern: `${host}/*`, zone_name: 'tutur3u.com' },
    ]);
    assert.equal(profile.workers_dev, false);
    assert.equal(profile.preview_urls, false);
    assert.equal(profile.vars.AUTH_COOKIE_DOMAIN, '.staging.tutur3u.com');
    assert.equal(profile.vars.NEXT_PUBLIC_APP_URL, `https://${host}`);
    assert.equal(
      profile.vars.NEXT_PUBLIC_WEB_APP_URL,
      'https://staging.tutur3u.com'
    );
    assert.equal(JSON.stringify(profile).includes('tuturuuu.com'), false);
    assert.equal(stagingRequest(new Request(`https://${host}/`), app), null);
    for (const url of [
      `https://${app}.tuturuuu.com/`,
      `https://evil.${host}/`,
      `http://${host}/`,
      `https://${host}./`,
      `https://${host}:8443/`,
    ]) {
      assert.equal(stagingRequest(new Request(url), app)?.status, 421);
    }
    for (const url of [
      `https://${host.toUpperCase()}/`,
      `https://${host}:443/`,
    ]) {
      assert.equal(stagingRequest(new Request(url), app), null);
    }
  });
}

test('staging response preserves status/body/cookie flags and pins HSTS/domain', async () => {
  const original = new Response('stage', {
    status: 201,
    headers: {
      'Set-Cookie':
        'session=fixture; Path=/; Domain=.tuturuuu.com; HttpOnly; SameSite=Lax; Secure',
    },
  });
  original.headers.append('Set-Cookie', 'other=fixture; Path=/; Max-Age=0');
  const response = stagingResponse(original);
  assert.equal(response.status, 201);
  assert.equal(await response.text(), 'stage');
  assert.equal(
    response.headers.get('Strict-Transport-Security'),
    'max-age=31536000'
  );
  assert.match(response.headers.get('X-Robots-Tag') ?? '', /noindex/u);
  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /; Domain=\.staging\.tutur3u\.com; Secure$/u);
    assert.equal(cookie.includes('.tuturuuu.com'), false);
  }
  assert.match(cookies[0] ?? '', /HttpOnly; SameSite=Lax/u);
  assert.match(cookies[1] ?? '', /Max-Age=0/u);
});

test('build inputs refuse missing refs, production Supabase and absent public keys', () => {
  const env = {
    WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
    WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${'s'.repeat(20)}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'disposable-public-fixture',
    NEXT_PUBLIC_APP_URL: 'https://calendar.staging.tutur3u.com',
    NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tutur3u.com',
    NEXT_PUBLIC_TUTURUUU_STAGING: '1',
    NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com',
  };
  assert.equal(stagingBuildInputs(env, 'calendar').ref, 's'.repeat(20));
  for (const key of Object.keys(env))
    assert.throws(() =>
      stagingBuildInputs({ ...env, [key]: undefined }, 'calendar')
    );
  assert.throws(() =>
    stagingBuildInputs(
      {
        ...env,
        WAVE1_PRODUCTION_SUPABASE_PROJECT_REF:
          env.WAVE1_STAGING_SUPABASE_PROJECT_REF,
      },
      'calendar'
    )
  );
  assert.throws(() =>
    stagingBuildInputs(
      {
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: `https://${'p'.repeat(20)}.supabase.co`,
      },
      'calendar'
    )
  );
});

test('provisioning preparation emits no DNS action and refuses wrong artifact identity', async () => {
  const { provisioningPlan, routeFreeConfig } = await import('./prepare.ts');
  const env = {
    WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
    WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${'s'.repeat(20)}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'disposable-public-fixture',
    NEXT_PUBLIC_APP_URL: 'https://calendar.staging.tutur3u.com',
    NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tutur3u.com',
    NEXT_PUBLIC_TUTURUUU_STAGING: '1',
    NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com',
  };
  for (const app of stagingApps) {
    const plan = provisioningPlan(app, {
      ...env,
      NEXT_PUBLIC_APP_URL: `https://${app}.staging.tutur3u.com`,
    });
    assert.equal(plan.execute, false);
    assert.equal(plan.createsDns, false);
    const config = {
      ...hostedStagingProfile(app, { ref: 's'.repeat(20) }).cloudflare,
      no_bundle: true,
      main: './worker.mjs',
    };
    const inputs = stagingBuildInputs(
      {
        ...env,
        NEXT_PUBLIC_APP_URL: `https://${app}.staging.tutur3u.com`,
      },
      app
    );
    assert.deepEqual(routeFreeConfig(config, app, inputs).routes, []);
    assert.throws(() =>
      routeFreeConfig(
        {
          ...config,
          unsafe: { bindings: [{ type: 'service', service: 'tuturuuu-web' }] },
        },
        app,
        inputs
      )
    );
    assert.throws(() =>
      routeFreeConfig(
        {
          ...config,
          services: [{ binding: 'PRODUCTION', service: 'tuturuuu-mail' }],
        },
        app,
        inputs
      )
    );
    assert.throws(() =>
      routeFreeConfig({ ...config, name: `tuturuuu-${app}` }, app, inputs)
    );
    assert.throws(() =>
      routeFreeConfig(
        { ...config, routes: [{ pattern: '*.staging.tutur3u.com/*' }] },
        app,
        inputs
      )
    );
    assert.throws(() =>
      routeFreeConfig({ ...config, no_bundle: false }, app, inputs)
    );
    assert.throws(() =>
      routeFreeConfig({ ...config, workers_dev: true }, app, inputs)
    );
  }
});

test('durable serving stop and wrong project refuse work across fresh invocations', async () => {
  const { stagingFetch } = await import('./response.ts');
  let calls = 0;
  const serve = () => {
    calls++;
    return new Response('accepted');
  };
  const env = {
    WAVE1_STAGING_SERVING_ENABLED: '1',
    WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${'s'.repeat(20)}.supabase.co`,
  };
  for (let restart = 0; restart < 2; restart++) {
    assert.equal(
      (
        await stagingFetch(
          new Request('https://meet.staging.tutur3u.com'),
          'meet',
          { ...env, WAVE1_STAGING_SERVING_ENABLED: '0' },
          serve
        )
      ).status,
      503
    );
    assert.equal(
      (
        await stagingFetch(
          new Request('https://meet.staging.tutur3u.com'),
          'meet',
          {
            ...env,
            NEXT_PUBLIC_SUPABASE_URL: `https://${'p'.repeat(20)}.supabase.co`,
          },
          serve
        )
      ).status,
      503
    );
    assert.equal(
      (
        await stagingFetch(
          new Request('https://meet.tuturuuu.com'),
          'meet',
          env,
          serve
        )
      ).status,
      421
    );
  }
  assert.equal(calls, 0);
  assert.equal(
    (
      await stagingFetch(
        new Request('https://meet.staging.tutur3u.com'),
        'meet',
        env,
        serve
      )
    ).status,
    200
  );
  assert.equal(calls, 1);
});

test('__Host- cookies stay host-only while shared cookies retain the staging domain', () => {
  const original = new Response(null);
  original.headers.append(
    'Set-Cookie',
    '__Host-session=fixture; Path=/; HttpOnly; SameSite=Lax; Secure'
  );
  original.headers.append(
    'Set-Cookie',
    '__Host-legacy=fixture; Domain=.tuturuuu.com; Path=/; Max-Age=0'
  );
  original.headers.append(
    'Set-Cookie',
    '__Secure-session=fixture; Path=/; HttpOnly'
  );
  const cookies = stagingResponse(original).headers.getSetCookie();
  assert.equal(
    cookies[0],
    '__Host-session=fixture; Path=/; HttpOnly; SameSite=Lax; Secure'
  );
  assert.equal(cookies[1], '__Host-legacy=fixture; Path=/; Max-Age=0; Secure');
  assert.equal(
    cookies[2],
    '__Secure-session=fixture; Path=/; HttpOnly; Domain=.staging.tutur3u.com; Secure'
  );
});

test('production project is refused even when runtime ref and URL agree', async () => {
  const { stagingFetch } = await import('./response.ts');
  let calls = 0;
  for (let restart = 0; restart < 2; restart++) {
    const response = await stagingFetch(
      new Request('https://calendar.staging.tutur3u.com'),
      'calendar',
      {
        WAVE1_STAGING_SERVING_ENABLED: '1',
        WAVE1_STAGING_SUPABASE_PROJECT_REF: 'nzamlzqfdwaaxdefwraj',
        NEXT_PUBLIC_SUPABASE_URL: 'https://nzamlzqfdwaaxdefwraj.supabase.co',
      },
      () => {
        calls++;
        return new Response('unsafe');
      }
    );
    assert.equal(response.status, 503);
  }
  assert.equal(calls, 0);
});

test('route-free preparation pins the independently reviewed staging ref', async () => {
  const { routeFreeConfig } = await import('./prepare.ts');
  const inputs = { ref: 's'.repeat(20), productionRef: 'nzamlzqfdwaaxdefwraj' };
  for (const ref of [inputs.productionRef, 'u'.repeat(20)]) {
    const config = {
      ...hostedStagingProfile('calendar', { ref }).cloudflare,
      no_bundle: true,
      main: './worker.mjs',
    };
    assert.throws(() => routeFreeConfig(config, 'calendar', inputs));
  }
});

test('build inputs deny the public production ref even with a falsely labelled production input', () => {
  assert.throws(() =>
    stagingBuildInputs(
      {
        WAVE1_STAGING_SUPABASE_PROJECT_REF: 'nzamlzqfdwaaxdefwraj',
        WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
        NEXT_PUBLIC_SUPABASE_URL: 'https://nzamlzqfdwaaxdefwraj.supabase.co',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
        NEXT_PUBLIC_APP_URL: 'https://calendar.staging.tutur3u.com',
        NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tutur3u.com',
        NEXT_PUBLIC_TUTURUUU_STAGING: '1',
        NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com',
      },
      'calendar'
    )
  );
});

test('Meet realtime route-free preparation preserves the reviewed source and rejects topology drift', async () => {
  const { routeFreeConfig } = await import('./prepare.ts');
  const config = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/meet-realtime/hosted-staging.cf.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  const inputs = { ref: 's'.repeat(20), productionRef: 'p'.repeat(20) };
  const result = routeFreeConfig(config, 'meet-realtime', inputs);
  assert.deepEqual(result, { ...config, routes: [] });
  assert.deepEqual(result.migrations, config.migrations);
  assert.deepEqual(result.durable_objects, config.durable_objects);
  for (const changed of [
    { name: 'tuturuuu-meet-realtime-wave1-staging' },
    {
      routes: [
        { pattern: '*.staging.tutur3u.com/*', zone_name: 'tutur3u.com' },
      ],
    },
    { workers_dev: true },
    { preview_urls: true },
    { migrations: [] },
    { vars: { NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com' } },
    { services: [{ binding: 'PRODUCTION', service: 'tuturuuu-meet' }] },
  ])
    assert.throws(() =>
      routeFreeConfig({ ...config, ...changed }, 'meet-realtime', inputs)
    );
});

test('offline plans fence certificates, existing Workers, seed receipts and route conflicts', async () => {
  const { provisioningPlan } = await import('./prepare.ts');
  const env = {
    WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
    WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
    NEXT_PUBLIC_SUPABASE_URL: `https://${'s'.repeat(20)}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
    NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tutur3u.com',
    NEXT_PUBLIC_TUTURUUU_STAGING: '1',
    NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com',
  };
  for (const app of stagingApps) {
    const plan = provisioningPlan(app, {
      ...env,
      NEXT_PUBLIC_APP_URL: `https://${app}.staging.tutur3u.com`,
    });
    assert.equal(plan.worker, `tuturuuu-${app}-hosted-staging`);
    const tasks = plan.tasks;
    const cert = tasks.findIndex(
      (task) =>
        task.operation ===
        'BLOCKING-owner-approved-zone-certificate-exception-or-rename-hosts'
    );
    const dns = tasks.findIndex(
      (task) =>
        task.operation ===
        'verify-exact-existing-DNS-and-zone-before-separate-staging-route-attachment'
    );
    const acceptance = tasks.findIndex(
      (task) =>
        task.operation === 'run-explicitly-authorized-signed-in-acceptance'
    );
    const coverage = tasks.findIndex(
      (task) =>
        task.operation ===
        'read-back-active-certificate-coverage-for-all-four-hosts-before-acceptance'
    );
    const beforeDns = tasks.findIndex(
      (task) =>
        task.operation ===
        'read-back-active-certificate-coverage-for-all-four-hosts-before-DNS'
    );
    const hostReadback = tasks.findIndex(
      (task) =>
        task.operation ===
        'read-back-host-routes-HSTS-cookie-and-build-identity'
    );
    assert.ok(
      cert >= 0 &&
        beforeDns > cert &&
        beforeDns < dns &&
        hostReadback > dns &&
        coverage > hostReadback &&
        coverage < acceptance
    );
    for (const index of [beforeDns, coverage]) {
      const task = tasks[index];
      assert.deepEqual(
        task && 'hosts' in task && task.hosts,
        stagingApps.map((name) => `${name}.staging.tutur3u.com`)
      );
      assert.equal(task?.billable, false);
    }
    const certificate = tasks[cert];
    assert.equal(certificate?.billable, true);
    assert.equal(
      certificate &&
        'ownerApprovalRequired' in certificate &&
        certificate.ownerApprovalRequired,
      true
    );
    assert.deepEqual(
      certificate && 'hosts' in certificate && certificate.hosts,
      stagingApps.map((name) => `${name}.staging.tutur3u.com`)
    );
    const inventory = tasks.findIndex(
      (task) =>
        task.operation ===
        'read-existing-Workers-buckets-and-routes-refuse-if-present-unless-explicitly-adopted'
    );
    const upload = tasks.findIndex(
      (task) =>
        task.operation ===
        'bootstrap-route-free-exact-artifact-with-protected-staging-credentials'
    );
    assert.ok(inventory >= 0 && inventory < upload);
    const readback = tasks[inventory];
    assert.deepEqual(readback && 'workers' in readback && readback.workers, [
      plan.worker,
      ...(app === 'meet' ? ['tuturuuu-meet-realtime-hosted-staging'] : []),
    ]);
    const buckets =
      app === 'meet'
        ? ['tuturuuu-meet-hosted-staging-cache']
        : app === 'mail'
          ? ['tuturuuu-mail-hosted-staging']
          : [];
    assert.deepEqual(
      readback && 'buckets' in readback && readback.buckets,
      buckets
    );
    const create = tasks.findIndex(
      (task) =>
        task.operation ===
        'create-isolated-bucket-if-provider-read-confirms-absent'
    );
    assert.equal(create >= 0, buckets.length > 0);
    if (create >= 0) {
      assert.ok(inventory < create);
      const task = tasks[create];
      assert.equal(task && 'bucket' in task && task.bucket, buckets[0]);
      assert.deepEqual(task && 'cli' in task && task.cli, [
        'cf',
        'r2',
        'buckets',
        'create',
        '--name',
        buckets[0],
      ]);
    }
    const calendar = tasks.find(
      (task) =>
        task.operation ===
        'calendar-never-reseed-existing-publisher-verify-seed-receipt-or-STOP'
    );
    assert.equal(Boolean(calendar), app === 'calendar');
    if (calendar) {
      assert.equal(
        'neverReseedExistingPublisher' in calendar &&
          calendar.neverReseedExistingPublisher,
        true
      );
    }
    const routes = tasks[dns];
    assert.equal(
      routes && 'onMatchingRoute' in routes && routes.onMatchingRoute,
      'no-op-and-record-existing-route-ID'
    );
    assert.equal(
      routes && 'onConflictingRoute' in routes && routes.onConflictingRoute,
      'STOP'
    );
  }
});

test('Turbo does not forward staging acceptance credentials to unrelated tasks', () => {
  const turbo = JSON.parse(
    readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8')
  );
  const forwarded = [...turbo.globalPassThroughEnv, ...turbo.globalEnv];
  for (const name of [
    'WAVE1_STAGING_*',
    'WAVE1_STAGING_PASSWORD',
    'WAVE1_STAGING_EMAIL',
    'WAVE1_STAGING_SERVING_ENABLED',
  ]) {
    assert.equal(forwarded.includes(name), false);
  }
});

test('hosted Workers and buckets never collide with existing publisher resource names', () => {
  const existingNames = new Set(
    [
      '../../scripts/ci/wave1-native-profiles.json',
      '../../apps/meet/void.staging.config.ts',
    ].flatMap(
      (path) =>
        readFileSync(new URL(path, import.meta.url), 'utf8').match(
          /tuturuuu-[a-z0-9-]+/gu
        ) ?? []
    )
  );
  const hosted = stagingApps.map(
    (app) => hostedStagingProfile(app, { ref: 's'.repeat(20) }).cloudflare
  );
  const realtime = JSON.parse(
    readFileSync(
      new URL(
        '../../apps/meet-realtime/hosted-staging.cf.json',
        import.meta.url
      ),
      'utf8'
    )
  );
  const hostedNames =
    JSON.stringify([...hosted, realtime]).match(/tuturuuu-[a-z0-9-]+/gu) ?? [];
  assert.ok(hostedNames.length > 0);
  for (const name of hostedNames) {
    assert.equal(
      existingNames.has(name),
      false,
      `Hosted resource collides: ${name}`
    );
  }
  assert.equal(
    hostedStagingProfile('mail', { ref: 's'.repeat(20) }).cloudflare.vars
      .MAIL_R2_BUCKET_NAME,
    'tuturuuu-mail-hosted-staging'
  );
  assert.equal(
    hostedStagingProfile('meet', { ref: 's'.repeat(20) }).cloudflare
      .r2_buckets?.[0]?.bucket_name,
    'tuturuuu-meet-hosted-staging-cache'
  );
});

test('__Host- cookie prefix is case-insensitive and never gains a Domain attribute', () => {
  for (const prefix of ['__Host-', '__host-', '__HOST-', '__hOsT-']) {
    const original = new Response(null, {
      headers: {
        'Set-Cookie': `${prefix}session=fixture; Domain=.tuturuuu.com; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
    assert.equal(
      stagingResponse(original).headers.getSetCookie()[0],
      `${prefix}session=fixture; Path=/; HttpOnly; SameSite=Lax; Secure`
    );
  }
});

test('Turbo strict build hashes and forwards both public project refs', () => {
  const turbo = JSON.parse(
    readFileSync(new URL('../../turbo.json', import.meta.url), 'utf8')
  );
  for (const name of [
    'WAVE1_STAGING_SUPABASE_PROJECT_REF',
    'WAVE1_PRODUCTION_SUPABASE_PROJECT_REF',
  ]) {
    assert.ok(
      turbo.tasks.build.env.includes(name),
      `Missing build env ${name}`
    );
  }
});
