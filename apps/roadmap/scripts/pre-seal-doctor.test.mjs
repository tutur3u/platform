import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDoctor,
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

function passing() {
  return {
    expectedCommit: COMMIT,
    canonical: {
      status: 200,
      cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
      body: `<link rel="canonical" href="https://tuturuuu.com/roadmap"/><meta property="og:url" content="https://tuturuuu.com/roadmap"/><link rel="alternate" hreflang="x-default" href="https://tuturuuu.com/roadmap"/><div class="public-satellite-shell"><a aria-label="Tuturuuu" href="https://tuturuuu.com"><img src="${LOGO}" alt=""></a><a href="https://tuturuuu.com/login">Sign in</a><script src="/roadmap/assets/index-CGgt8iCG.js"></script>${[...STAGE_LABELS, PLAN_LABEL].join(' ')}</div>`,
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
