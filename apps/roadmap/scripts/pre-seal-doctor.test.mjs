import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessDoctor,
  brokenVariant,
  reportBrokenVariant,
  STAGE_LABELS,
} from './pre-seal-doctor.mjs';
import '../../../scripts/ci/asset-smoke.test.mjs';

const LOGO = 'https://tuturuuu.com/media/logos/transparent.png';
const COMMIT = 'a'.repeat(40);

function passing() {
  return {
    expectedCommit: COMMIT,
    canonical: {
      status: 200,
      cacheControl: 'public,s-maxage=300,stale-while-revalidate=86400',
      body: `<div class="public-satellite-shell"><a aria-label="Tuturuuu" href="https://tuturuuu.com"><img src="${LOGO}" alt=""></a><a href="https://tuturuuu.com/login">Sign in</a><script src="/roadmap/assets/index-CGgt8iCG.js"></script>${STAGE_LABELS.join(' ')}</div>`,
    },
    satellite: { status: 301, location: 'https://tuturuuu.com/roadmap/' },
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
