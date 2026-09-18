const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot } = require('./workflow-config-test-helpers.js');
const ciConfig = fs.readFileSync(path.join(repoRoot, 'tuturuuu.ci.ts'), 'utf8');

test('mobile store deployment workflow is production-only beta delivery with verified store availability', () => {
  const workflowName = 'mobile-deploy-stores.yaml';
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    workflowName
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(
    ciConfig,
    /["']mobile-deploy-stores\.yaml["']:\s*true/,
    'mobile store deployment workflow must be registered in the CI config'
  );

  execFileSync(
    'ruby',
    ['-e', "require 'yaml'; YAML.load_file(ARGV.fetch(0))", workflowPath],
    {
      cwd: repoRoot,
      stdio: 'pipe',
    }
  );

  assert.match(workflow, /^on:\n {2}push:\n/m);
  assert.doesNotMatch(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /branches:\n\s+- production/);
  assert.match(workflow, /environment: mobile-store-beta/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /mobile-credentials-preflight:/);
  assert.match(workflow, /name: Check mobile deployment credentials/);
  assert.match(
    workflow,
    /has_ci_token: \$\{\{ steps\.credentials\.outputs\.has_ci_token \}\}/
  );
  assert.match(workflow, /echo "has_ci_token=false" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    workflow,
    /::error title=Mobile store deployment blocked::MOBILE_DEPLOYMENT_CI_TOKEN is not configured/
  );
  assert.match(workflow, /echo "has_ci_token=true" >> "\$GITHUB_OUTPUT"/);
  assert.match(
    workflow,
    /publish-android-internal:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.outputs\.has_ci_token == 'true'/
  );
  assert.match(
    workflow,
    /publish-ios-testflight:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.outputs\.has_ci_token == 'true'/
  );
  assert.match(workflow, /MOBILE_DEPLOYMENT_CI_TOKEN/);
  assert.match(workflow, /audience=tuturuuu-mobile-deployment/);
  assert.match(
    workflow,
    /https:\/\/infrastructure\.tuturuuu\.com\/api\/v1\/mobile-deployment\/bundle\?environment=production&platform=android/
  );
  assert.match(
    workflow,
    /https:\/\/infrastructure\.tuturuuu\.com\/api\/v1\/mobile-deployment\/bundle\?environment=production&platform=ios/
  );
  assert.match(workflow, /X-GitHub-OIDC-Token/);
  assert.match(workflow, /hydrate-bundle\.mjs/);
  assert.match(workflow, /bun build:android/);
  assert.match(workflow, /Build and verify signed Android App Bundle/);
  assert.match(workflow, /--dart-define-from-file=\.env\.github/);
  assert.match(
    workflow,
    /serviceAccountJson: \$\{\{ env\.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH \}\}/
  );
  assert.match(workflow, /track:\s*internal/);
  assert.match(workflow, /status: completed/);
  assert.match(workflow, /xcrun altool --upload-app/);
  assert.match(workflow, /--type ios/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.match(workflow, /test "\$GITHUB_REF" = refs\/heads\/production/);
  assert.match(workflow, /verify-store\.mjs android/);
  assert.match(workflow, /verify-store\.mjs ios/);
  assert.match(workflow, /verify-profile\.swift/);
  assert.match(workflow, /--build-number=/);
  assert.doesNotMatch(workflow, /tracks?:\s*production/i);
  assert.doesNotMatch(workflow, /MOBILE_ENV_PRODUCTION_B64/);
  assert.doesNotMatch(workflow, /MOBILE_ANDROID_GOOGLE_SERVICES_JSON_B64/);
  assert.doesNotMatch(workflow, /MOBILE_IOS_GOOGLE_SERVICE_INFO_PLIST_B64/);
  assert.doesNotMatch(workflow, /ANDROID_UPLOAD_KEYSTORE_B64/);
  assert.doesNotMatch(workflow, /secrets\.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(
    workflow,
    /secrets\.APPLE_DISTRIBUTION_CERTIFICATE_P12_B64/
  );
  assert.doesNotMatch(workflow, /secrets\.APP_STORE_CONNECT_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /apple-actions\/upload-testflight-build/);

  for (const match of workflow.matchAll(/uses:\s*([^\s]+)/g)) {
    const action = match[1];
    if (!action || action.startsWith('./')) {
      continue;
    }

    const [, ref] = action.split('@');
    assert.match(
      ref || '',
      /^[0-9a-f]{40}$/,
      `${action} must be pinned to a full commit SHA`
    );
  }

  assert.match(
    workflow,
    /path: apps\/mobile\/build\/app\/outputs\/bundle\/productionRelease\/app-production-release\.aab/
  );
  assert.match(workflow, /path: \$\{\{ steps\.ios-ipa\.outputs\.path \}\}/);
  assert.doesNotMatch(workflow, /path: .*mobile-deployment/i);
});
