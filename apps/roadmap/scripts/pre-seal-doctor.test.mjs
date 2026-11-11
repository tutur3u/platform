import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDoctor,
  inlineScriptHashes,
  CANONICAL_URL,
  REDIRECT_CHAINS,
  PLAN_LABEL,
  brokenVariant,
  reportBrokenVariant,
  STAGE_LABELS,
} from './pre-seal-doctor.mjs';
import '../../../scripts/ci/asset-smoke.test.mjs';

const LOGO = '/roadmap/assets/tuturuuu-logo-Abcd1234.png';
const COMMIT = 'a'.repeat(40);

function passingRaw() {
  return {
    expectedCommit: COMMIT,
    canonical: {
      status: 200,
      cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
      body: `<link rel="canonical" href="https://tuturuuu.com/roadmap"/><link rel="prefetch" href="/roadmap/assets/history-Abcd1234.json" as="fetch"/><h2 id="timeline-title">Timeline</h2><meta property="og:url" content="https://tuturuuu.com/roadmap"/><meta property="og:image" content="https://tuturuuu.com/roadmap/assets/og-roadmap-Abcd1234.png"/><link rel="alternate" hreflang="x-default" href="https://tuturuuu.com/roadmap"/><header id="navbar"><a href="https://tuturuuu.com/home"><img alt="Tuturuuu" src="${LOGO}"></a><a href="https://tuturuuu.com/login">Get Started</a></header><div id="main-content"><script src="/roadmap/assets/index-CGgt8iCG.js"></script>${[...STAGE_LABELS, PLAN_LABEL].join(' ')}</div><footer></footer>`,
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

test('D79: a page without the timeline or its history asset fails', () => {
  const observation = passing();
  observation.canonical.body = observation.canonical.body
    .replace('id="timeline-title"', '')
    .replace('history-Abcd1234.json', 'history.json');
  const verdict = assessDoctor(observation);
  assert.ok(verdict.failures.includes('canonical HTML missing the timeline'));
  assert.ok(
    verdict.failures.includes(
      'canonical HTML missing the hashed history prefetch'
    )
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
