import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBuiltWorkerConfig } from './doctor-config.mjs';
import {
  assertWorkerOrigins,
  assessDoctor,
  inlineScriptHashes,
  CANONICAL_URL,
  REDIRECT_CHAINS,
  PLAN_LABEL,
  brokenVariant,
  doctorCompatibilityDate,
  PUBLIC_DOCUMENT_PATHS,
  reportBrokenVariant,
  speculativeLinks,
  STAGE_LABELS,
} from './pre-seal-doctor.mjs';
import {
  DOCUMENT_BUDGET,
  documentBudgetReport,
  scriptCoverage,
  pendingBoundaryFailures,
  redundantAltFailures,
} from './doctor-markup.mjs';
import '../../../scripts/ci/asset-smoke.test.mjs';
import './canonical-smoke.test.mjs';

const LOGO = '/roadmap/assets/tuturuuu-logo-Abcd1234.png';
const COMMIT = 'a'.repeat(40);

function passingRaw() {
  return {
    expectedCommit: COMMIT,
    canonical: {
      status: 200,
      cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
      body: `<link rel="canonical" href="https://tuturuuu.com/roadmap"/><h2 id="timeline-title">Timeline</h2><meta property="og:url" content="https://tuturuuu.com/roadmap"/><meta property="og:image" content="https://tuturuuu.com/roadmap/assets/og-roadmap-Abcd1234.png"/><link rel="alternate" hreflang="x-default" href="https://tuturuuu.com/roadmap"/><header id="navbar"><a href="https://tuturuuu.com/home"><img alt="" src="${LOGO}"><span class="font-bold">Tuturuuu</span></a><a href="https://tuturuuu.com/login">Get Started</a></header><div id="main-content"><script src="/roadmap/assets/index-CGgt8iCG.js"></script>${[...STAGE_LABELS, PLAN_LABEL].join(' ')}</div><footer></footer>`,
    },
    satellite: { status: 301, location: 'https://tuturuuu.com/roadmap' },
    redirects: REDIRECT_CHAINS.map((chain) => ({
      host: chain.host,
      path: chain.path,
      status: 301,
      location: chain.location,
    })),
    satelliteQuery: {
      status: 301,
      location: 'https://tuturuuu.com/roadmap/notes?x=1',
    },
    buildInfo: { status: 200, commit: COMMIT },
    asset: {
      url: '/roadmap/assets/index-CGgt8iCG.js',
      cacheControl: 'public, max-age=31536000, immutable',
    },
    documents: PUBLIC_DOCUMENT_PATHS.map((path) => ({
      path,
      status: 200,
      size: 330_000,
      scripts: { inline: 4, uncovered: 0 },
      speculative: [],
    })),
    history: {
      url: '/roadmap/assets/history-Abcd1234.json',
      status: 200,
      contentType: 'application/json',
      bytes: 240_855,
    },
  };
}

const CSP_REST =
  "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; connect-src 'self' https://api.github.com";

function passing() {
  const observation = passingRaw();
  observation.canonical.body += '<script>self.boot=1</script >';
  observation.canonical.csp = `script-src 'self' ${inlineScriptHashes(
    observation.canonical.body
  ).join(' ')}; ${CSP_REST}`;
  return observation;
}

test('a correct worker passes the pre-seal doctor', () => {
  const verdict = assessDoctor(passing());
  assert.deepEqual(verdict.failures, []);
  assert.equal(verdict.ok, true);
});

test('D79: the doctor fails on a broken variant', () => {
  const broken = assessDoctor(brokenVariant(passing()));
  assert.equal(broken.ok, false);
  assert.ok(
    broken.failures.some((failure) => failure.includes('satellite status 200'))
  );
  assert.ok(
    broken.failures.some((failure) => failure.includes('build-info commit'))
  );
  const report = reportBrokenVariant(passing());
  assert.equal(report.ok, true);
  for (const line of report.lines) console.error(line);
});

test('D79: an apex logo outside the roadmap mount fails the doctor', () => {
  const observation = passing();
  observation.canonical.body = observation.canonical.body.replace(
    LOGO,
    'https://tuturuuu.com/media/logos/transparent.png'
  );
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.includes(
      'canonical HTML missing the mounted Tuturuuu logo'
    )
  );
});

test('D79: the plans card must follow the showPlans flag both ways', () => {
  const shown = passing();
  assert.equal(assessDoctor({ ...shown, showPlans: true }).ok, true);
  const missing = passing();
  missing.canonical.body = missing.canonical.body.replace(PLAN_LABEL, '');
  assert.ok(
    assessDoctor({ ...missing, showPlans: true }).failures.some((f) =>
      f.includes('while showPlans is on')
    )
  );
  assert.ok(
    assessDoctor({ ...shown, showPlans: false }).failures.some((f) =>
      f.includes('while showPlans is off')
    )
  );
  assert.equal(assessDoctor({ ...missing, showPlans: false }).ok, true);
});

test('D79: a slash form served as a page fails the no-slash canonical', () => {
  const observation = passing();
  observation.redirects[0] = {
    ...observation.redirects[0],
    status: 200,
    location: null,
  };
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((f) =>
      f.startsWith('tuturuuu.com/roadmap/ answered 200')
    )
  );
});

test('D79: a two-hop chain (via the slash form) fails', () => {
  const observation = passing();
  const satellite = observation.redirects.find(
    (r) => r.host === 'roadmap.tuturuuu.com' && r.path === '/'
  );
  satellite.location = 'https://tuturuuu.com/roadmap/';
  observation.satellite.location = 'https://tuturuuu.com/roadmap/';
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((f) =>
      f.includes(`expected one 301 to ${CANONICAL_URL}`)
    )
  );
});

test('D79: a trailing-slash canonical tag fails', () => {
  const observation = passing();
  observation.canonical.body = observation.canonical.body.replace(
    'rel="canonical" href="https://tuturuuu.com/roadmap"',
    'rel="canonical" href="https://tuturuuu.com/roadmap/"'
  );
  const verdict = assessDoctor(observation);
  assert.ok(
    verdict.failures.includes(`canonical link is not ${CANONICAL_URL}`)
  );
  assert.ok(
    verdict.failures.includes('HTML still references the trailing-slash URL')
  );
});

test('D79: a page without the timeline, or a history asset that is not served, fails', () => {
  const observation = passing();
  observation.canonical.body = observation.canonical.body.replace(
    'id="timeline-title"',
    ''
  );
  observation.history = { ...observation.history, status: 404, bytes: 0 };
  const verdict = assessDoctor(observation);
  assert.ok(verdict.failures.includes('canonical HTML missing the timeline'));
  assert.ok(
    verdict.failures.some((failure) =>
      failure.startsWith('hashed history asset /roadmap/assets/history-')
    ),
    verdict.failures.join('\n')
  );
  observation.history = { url: null };
  assert.ok(
    assessDoctor(observation).failures.includes(
      'the build emitted no hashed history asset'
    )
  );
});

test('D79 (#8163): a prefetch or prerender on any public page fails, since the zone 503s Sec-Purpose: prefetch', () => {
  assert.deepEqual(
    speculativeLinks(
      '<link rel="prefetch" href="/roadmap/assets/history-Abcd1234.json" as="fetch"/>' +
        '<link rel="dns-prefetch" href="https://api.github.com"/>' +
        "<link href='/roadmap/vi' rel='prerender'>" +
        '<link rel="preload" as="font" href="/roadmap/assets/a-Abcd1234.woff2">'
    ),
    ['/roadmap/assets/history-Abcd1234.json', '/roadmap/vi']
  );
  assert.deepEqual(
    speculativeLinks('<script type="speculationrules">{}</script>'),
    ['speculationrules']
  );
  // Broken variant: the production failure is caught on every page.
  const observation = passing();
  observation.documents[2].speculative = [
    '/roadmap/assets/history-Abcd1234.json',
  ];
  const { ok, failures } = assessDoctor(observation);
  assert.equal(ok, false);
  assert.ok(
    failures.some(
      (failure) =>
        failure.startsWith(
          '/roadmap/workshops/edufest-2026 speculatively loads /roadmap/assets/history-'
        ) && failure.includes('Speed Brain')
    ),
    failures.join('\n')
  );
  // A page that was never probed is a failure, not a pass.
  observation.documents = observation.documents.slice(0, 1);
  assert.ok(
    assessDoctor(observation).failures.includes('/roadmap/vi was not probed')
  );
});

test('D79: the satellite shell instead of the marketing layout fails', () => {
  const observation = passing();
  observation.canonical.body = observation.canonical.body
    .replace('id="navbar"', 'class="public-satellite-shell"')
    .replace('<footer></footer>', '');
  const verdict = assessDoctor(observation);
  assert.ok(
    verdict.failures.includes('canonical HTML missing the marketing navbar')
  );
  assert.ok(
    verdict.failures.includes('canonical HTML missing the marketing footer')
  );
  assert.ok(
    verdict.failures.includes('canonical HTML still uses the satellite shell')
  );
});

test('D79: an inline script missing from the CSP fails the doctor', () => {
  const observation = passing();
  observation.canonical.body += '<script>self.injected=1</script\t\nfoo>';
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((f) => f.startsWith('CSP script-src does not allow'))
  );
});

test('D79: a missing or permissive CSP fails the doctor', () => {
  const missing = passing();
  delete missing.canonical.csp;
  assert.ok(
    assessDoctor(missing).failures.includes(
      'canonical HTML missing content-security-policy'
    )
  );
  const loose = passing();
  loose.canonical.csp = loose.canonical.csp.replace(
    "script-src 'self'",
    "script-src 'self' 'unsafe-inline'"
  );
  assert.ok(
    assessDoctor(loose).failures.some((f) =>
      f.startsWith('CSP script-src too broad')
    )
  );
  const noObject = passing();
  noObject.canonical.csp = noObject.canonical.csp.replace(
    "object-src 'none'; ",
    ''
  );
  assert.ok(
    assessDoctor(noObject).failures.includes("CSP missing object-src 'none'")
  );
});

test('D79/D87 A5: script text inside an attribute is not counted as an inline script', () => {
  assert.deepEqual(
    inlineScriptHashes('<div title="<script>alert(1)</script>"></div>'),
    []
  );
});

test('D79: a client-render fallback or a missing og:image fails the doctor', () => {
  const { ok, failures } = assessDoctor(brokenVariant(passing()));
  assert.equal(ok, false);
  assert.ok(
    failures.includes(
      'canonical HTML fell back to client rendering (server render failed)'
    ),
    failures.join('\n')
  );
  assert.ok(failures.includes('canonical HTML missing an absolute og:image'));
});

test('doctor runs the configured compatibility date, capped at what workerd supports', () => {
  assert.equal(
    doctorCompatibilityDate('2026-07-01', '2026-07-30'),
    '2026-07-01'
  );
  assert.equal(
    doctorCompatibilityDate('2026-11-07', '2026-07-30'),
    '2026-07-30'
  );
  // Broken variant: a missing date must not reach workerd as undefined.
  assert.equal(doctorCompatibilityDate(undefined, '2026-07-30'), '2026-07-30');
});

test('D79: a navbar logo whose alt repeats the brand name beside it fails the doctor', () => {
  const observation = passing();
  assert.deepEqual(redundantAltFailures(observation.canonical.body), []);
  observation.canonical.body = observation.canonical.body.replace(
    '<img alt="" ',
    '<img alt="Tuturuuu" '
  );
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((failure) => failure.includes('image-redundant-alt')),
    verdict.failures.join('\n')
  );
});

test('D79: a public document over half the CSP size limit fails the doctor', () => {
  const observation = passing();
  assert.deepEqual(assessDoctor(observation).failures, []);
  const report = documentBudgetReport(observation.documents);
  assert.equal(report.length, PUBLIC_DOCUMENT_PATHS.length);
  assert.match(report[0] ?? '', /% under the 2048 KiB CSP limit/);
  // Broken variant: an oversized EduFest page (its CSP would get no hashes).
  observation.documents[2].size = DOCUMENT_BUDGET + 1;
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((failure) =>
      failure.startsWith('/roadmap/workshops/edufest-2026 is ')
    ),
    verdict.failures.join('\n')
  );
  // An unmeasured document is a failure too, never a silent pass.
  delete observation.documents[0].size;
  assert.ok(
    assessDoctor(observation).failures.some((failure) =>
      failure.includes('size was not measured')
    )
  );
});

test('D79: a Suspense boundary left pending on the server fails the doctor', () => {
  const observation = passing();
  observation.canonical.body += '<!--$--><section>done</section><!--/$-->';
  assert.deepEqual(pendingBoundaryFailures(observation.canonical.body), []);
  // Broken variant: a boundary streamed later (fallback now, content after).
  observation.canonical.body +=
    '<!--$?--><template id="B:0"></template><!--/$-->';
  const verdict = assessDoctor(observation);
  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.failures.some((failure) => failure.includes('pending Suspense')),
    verdict.failures.join('\n')
  );
});

test('D79: every public page has exactly four inline scripts, all hashed', () => {
  const observation = passing();
  assert.deepEqual(assessDoctor(observation).failures, []);
  const csp = "script-src 'self' 'sha256-a' 'sha256-b' 'sha256-c' 'sha256-d'";
  const four = ["'sha256-a'", "'sha256-b'", "'sha256-c'", "'sha256-d'"];
  assert.deepEqual(scriptCoverage(four, csp), { inline: 4, uncovered: 0 });
  // Broken variants: a fifth inline script (the old hydration loader), and
  // one the policy does not hash.
  observation.documents[1].scripts = scriptCoverage(
    [...four, "'sha256-loader'"],
    `${csp} 'sha256-loader'`
  );
  observation.documents[3].scripts = scriptCoverage(
    ["'sha256-a'", "'sha256-b'", "'sha256-c'", "'sha256-x'"],
    csp
  );
  const failures = assessDoctor(observation).failures;
  assert.ok(
    failures.includes('/roadmap/vi has 5 inline scripts, expected exactly 4'),
    failures.join('\n')
  );
  assert.ok(
    failures.includes(
      '/roadmap/vi/workshops/edufest-2026 has 1 inline scripts its CSP does not hash'
    ),
    failures.join('\n')
  );
});

function emittedConfig() {
  return {
    workers_dev: false,
    preview_urls: false,
    routes: [
      { pattern: 'tuturuuu.com/roadmap', zone_name: 'tuturuuu.com' },
      { pattern: 'tuturuuu.com/roadmap/*', zone_name: 'tuturuuu.com' },
    ],
  };
}

test('emitted Worker config restricts origins to the canonical routes', () => {
  assert.doesNotThrow(() => assertWorkerOrigins(emittedConfig()));
});

for (const [name, mutate] of [
  [
    'workers.dev enabled',
    (config) => {
      config.workers_dev = true;
    },
  ],
  [
    'workers.dev missing',
    (config) => {
      delete config.workers_dev;
    },
  ],
  [
    'preview URLs missing',
    (config) => {
      delete config.preview_urls;
    },
  ],
  [
    'preview URLs enabled',
    (config) => {
      config.preview_urls = true;
    },
  ],
  [
    'extra route',
    (config) => {
      config.routes.push({
        pattern: 'tuturuuu.com/*',
        zone_name: 'tuturuuu.com',
      });
    },
  ],
  [
    'missing route',
    (config) => {
      config.routes.pop();
    },
  ],
  [
    'wrong zone',
    (config) => {
      config.routes[0].zone_name = 'example.com';
    },
  ],
]) {
  test(`D79: emitted Worker config rejects ${name}`, () => {
    const config = emittedConfig();
    mutate(config);
    assert.throws(() => assertWorkerOrigins(config));
  });
}

test('doctor reads the emitted JSON config, rejecting missing or ambiguous output', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'roadmap-doctor-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(readBuiltWorkerConfig(root), /Require one emitted/);
  const config = {
    ...emittedConfig(),
    name: 'tuturuuu-roadmap',
    main: 'index.js',
  };
  await writeFile(join(root, 'worker.json'), JSON.stringify(config));
  assert.deepEqual(await readBuiltWorkerConfig(root), config);
  await writeFile(join(root, 'extra.json'), '{}');
  await assert.rejects(readBuiltWorkerConfig(root), /Require one emitted/);
});
