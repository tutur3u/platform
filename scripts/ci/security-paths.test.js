const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  classifyReview,
  classifyScope,
  ownerForPath,
} = require('./security-paths.js');
const {
  decide,
  independentApprovers,
  parseReviewers,
  summarize,
} = require('./security-review-classification.js');
const { required, trustSuites } = require('./security-trust-tests.js');

const categoriesOf = (paths) =>
  classifyReview(paths)
    .categories.map(({ category }) => category)
    .sort();

test('security-sensitive paths require review by category', () => {
  for (const [filePath, category] of [
    ['.github/workflows/codeql.yml', 'ci'],
    ['scripts/ci/check-workflow-config.ts', 'ci'],
    ['tuturuuu.ci.ts', 'ci'],
    ['scripts/git-sync.js', 'ci'],
    ['packages/auth/src/session.ts', 'auth'],
    ['apps/web/src/app/api/auth/callback/route.ts', 'auth'],
    ['apps/web/src/lib/sso/redirect.ts', 'auth'],
    ['apps/meet/src/proxy.ts', 'auth'],
    ['packages/utils/src/workspace-user-link.ts', 'auth'],
    ['apps/database/supabase/migrations/20261023000000_x.sql', 'rls-database'],
    ['packages/supabase/src/next/server.ts', 'rls-database'],
    ['packages/utils/src/workspace-helper.ts', 'tenant-isolation'],
    ['apps/web/src/lib/permissions.ts', 'tenant-isolation'],
    ['apps/devbox-control/src/index.ts', 'runner-sandbox'],
    ['apps/playground/src/runtime.ts', 'runner-sandbox'],
    ['apps/meet/wrangler.jsonc', 'runner-sandbox'],
    ['apps/web/src/lib/api-keys.ts', 'tokens-secrets'],
    ['apps/web/.env.example', 'tokens-secrets'],
    ['packages/storage-core/src/index.ts', 'storage'],
    ['apps/web/src/app/api/v1/upload/route.ts', 'storage'],
    ['apps/pay/src/app/api/payment/webhooks/route.ts', 'payments'],
    [
      'apps/pay/src/app/api/payment/credit-packs/checkouts/route.ts',
      'payments',
    ],
    ['apps/pay/src/app/api/billing/[wsId]/invoice/route.ts', 'payments'],
    ['packages/payment-core/src/index.ts', 'payments'],
    [
      'apps/inventory/src/app/api/v1/webhooks/sepay/[token]/route.ts',
      'inbound-webhooks',
    ],
    [
      'apps/infrastructure/src/lib/inventory/commerce/square/webhooks.ts',
      'inbound-webhooks',
    ],
    ['apps/web/src/lib/sepay-client.ts', 'payments'],
    ['apps/calendar/src/app/api/cron/sync/route.ts', 'scheduled-jobs'],
    ['apps/infrastructure/src/lib/post-email-queue-cron.ts', 'scheduled-jobs'],
    ['apps/mail/src/lib/mail/inbound/parse.ts', 'inbound-webhooks'],
    ['packages/utils/src/required-mfa-policy.ts', 'auth'],
    ['apps/web/src/lib/oidc-provider.ts', 'auth'],
    // Paths #6491 adds to CODEOWNERS stay classified as well.
    ['apps/web/src/app/api/auth/session/route.ts', 'auth'],
    ['packages/satellite/src/auth.ts', 'auth'],
    ['apps/web/src/lib/api-auth.ts', 'auth'],
    ['packages/sdk/src/platform-sdk-auth.ts', 'auth'],
    ['apps/web/src/lib/devboxes/agent-auth.ts', 'runner-sandbox'],
    ['apps/infrastructure/src/lib/devboxes/claims.ts', 'runner-sandbox'],
  ]) {
    assert.ok(
      categoriesOf([filePath]).includes(category),
      `${filePath} -> ${category}`
    );
  }
});

test('ordinary product, docs and translation changes need no security review', () => {
  for (const filePath of [
    'apps/calendar/src/components/event-card.tsx',
    'packages/ui/src/components/ui/button.tsx',
    'apps/docs/platform/architecture/authentication.mdx',
    'apps/web/messages/en.json',
    'README.md',
    '.github/screenshots/mobile-settings-apps/settings-root.png',
  ]) {
    assert.deepEqual(categoriesOf([filePath]), [], filePath);
  }
});

test('only inert screenshot images are exempt under .github', () => {
  for (const filePath of [
    '.github/screenshots/run.sh',
    '.github/screenshots/x.svg',
    '.github/workflows/screenshot.png.yml',
    '.github/screenshots.png',
  ]) {
    assert.deepEqual(categoriesOf([filePath]), ['ci'], filePath);
  }
});

test('truncated file lists and renames out of sensitive paths stay reviewed', () => {
  assert.deepEqual(categoriesOf([]), []);
  const truncated = classifyReview(['README.md'], { truncated: true });
  assert.equal(truncated.required, true);
  assert.equal(truncated.categories[0].category, 'file-list-truncated');
  // The classifier receives both names of a rename.
  assert.ok(
    categoriesOf(['src/renamed.ts', 'packages/auth/src/x.ts']).includes('auth')
  );
});

test('scan scope selects CodeQL languages and dependency audits', () => {
  assert.deepEqual(classifyScope(['apps/web/src/a.tsx']), {
    codeqlLanguages: ['javascript-typescript'],
    dependencies: false,
    workflows: false,
  });
  assert.deepEqual(classifyScope(['apps/discord/app.py', 'bun.lock']), {
    codeqlLanguages: ['python'],
    dependencies: true,
    workflows: false,
  });
  assert.deepEqual(
    classifyScope(['.github/workflows/x.yaml']).codeqlLanguages,
    ['actions']
  );
  assert.deepEqual(classifyScope(['docs/a.md']).codeqlLanguages, []);
  // Unknown or empty change sets and scheduled runs scan everything.
  for (const scope of [
    classifyScope(null),
    classifyScope([]),
    classifyScope(['', '  ']),
    classifyScope([], { full: true }),
  ]) {
    assert.deepEqual(scope.codeqlLanguages, [
      'actions',
      'javascript-typescript',
      'python',
    ]);
    assert.equal(scope.dependencies, true);
  }
  assert.equal(ownerForPath('apps/database/x.sql'), 'database');
  assert.equal(
    ownerForPath('apps/calendar/x.ts'),
    'security-integration-owner'
  );
});

const head = 'a'.repeat(40);
const review = (login, state, commit = head, type = 'User') => ({
  commit_id: commit,
  state,
  user: { login, type },
});

test('only a configured, independent approval of the head satisfies review', () => {
  const reviewers = parseReviewers('alice, Bob');
  const base = { author: 'mallory', headSha: head, reviewers };
  assert.deepEqual(
    independentApprovers({ ...base, reviews: [review('alice', 'APPROVED')] }),
    ['alice']
  );
  for (const reviews of [
    [review('mallory', 'APPROVED')],
    [review('carol', 'APPROVED')],
    [review('alice', 'APPROVED', 'b'.repeat(40))],
    [review('alice', 'APPROVED'), review('alice', 'CHANGES_REQUESTED')],
    [review('bob', 'APPROVED', head, 'Bot')],
  ]) {
    assert.deepEqual(independentApprovers({ ...base, reviews }), []);
  }
  assert.deepEqual(
    independentApprovers({
      ...base,
      author: 'alice',
      reviews: [review('alice', 'APPROVED')],
    }),
    []
  );
  // A later comment does not withdraw an approval.
  assert.deepEqual(
    independentApprovers({
      ...base,
      reviews: [review('bob', 'APPROVED'), review('bob', 'COMMENTED')],
    }),
    ['Bob'.toLowerCase()]
  );
});

test('classification decisions and summaries', () => {
  const input = {
    author: 'mallory',
    headSha: head,
    reviewers: parseReviewers('alice'),
    reviews: [],
    reviewsComplete: true,
    truncated: false,
  };
  const clean = decide({ ...input, files: ['README.md'] });
  assert.equal(clean.conclusion, 'success');
  assert.equal(clean.required, false);
  const pending = decide({ ...input, files: ['.github/workflows/x.yaml'] });
  assert.equal(pending.conclusion, 'action_required');
  assert.match(summarize(pending), /ci\*\* \(owner: ci-cd\): 1 path/u);
  const unconfigured = decide({
    ...input,
    files: ['.github/workflows/x.yaml'],
    reviewers: parseReviewers(''),
  });
  assert.match(unconfigured.title, /SECURITY_REVIEWERS is not configured/u);
  const approved = decide({
    ...input,
    files: ['.github/workflows/x.yaml'],
    reviews: [review('alice', 'APPROVED')],
  });
  assert.equal(approved.conclusion, 'success');
  assert.equal(approved.required, true);
  // An approval in an incomplete review history is never authoritative.
  for (const reviewsComplete of [false, undefined]) {
    const partial = decide({
      ...input,
      files: ['.github/workflows/x.yaml'],
      reviews: [review('alice', 'APPROVED')],
      reviewsComplete,
    });
    assert.equal(partial.conclusion, 'action_required');
    assert.match(partial.title, /could not be read completely/u);
  }
});

test('trust-boundary runner requires its core suites', () => {
  const suites = trustSuites([
    ...required,
    'workflow-action-pins.test.js',
    'security-paths.test.js',
    'release-workflows.test.js',
  ]);
  assert.ok(suites.includes('workflow-action-pins.test.js'));
  assert.ok(!suites.includes('release-workflows.test.js'));
  assert.throws(
    () => trustSuites(['workflow-x.test.js']),
    /missing trust suite/u
  );
});
