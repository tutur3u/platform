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

  const parsed = JSON.parse(
    execFileSync(
      'ruby',
      [
        '-e',
        "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV.fetch(0)))",
        workflowPath,
      ],
      {
        cwd: repoRoot,
        stdio: 'pipe',
        encoding: 'utf8',
      }
    )
  );

  // Ruby's YAML 1.1 parser represents the unquoted `on` key as true.
  assert.deepEqual(Object.keys(parsed.true), ['push', 'workflow_dispatch']);
  assert.deepEqual(parsed.true.push.branches, ['production']);
  assert.deepEqual(parsed.permissions, {
    contents: 'read',
    deployments: 'read',
    'id-token': 'write',
  });
  const preflight = parsed.jobs['mobile-credentials-preflight'];
  assert.equal(preflight.environment, 'mobile-store-beta');
  assert.equal(preflight.outputs.has_ci_token, undefined);
  assert.equal(
    preflight.outputs.build_name,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    '${{ steps.version_name.outputs.build_name }}'
  );
  assert.equal(
    preflight.steps[0].run,
    'test "$GITHUB_REF" = refs/heads/production'
  );
  const step = (job, name) => {
    const matches = job.steps.filter((entry) => entry.name === name);
    assert.equal(matches.length, 1, `Expected exactly one ${name} step`);
    return matches[0];
  };
  for (const [platform, jobId] of [
    ['android', 'publish-android-internal'],
    ['ios', 'publish-ios-testflight'],
  ]) {
    const job = parsed.jobs[jobId];
    assert.deepEqual(job.needs, ['check-ci', 'mobile-credentials-preflight']);
    assert.equal(
      job.if,
      "github.event_name == 'push' && needs.check-ci.outputs.should_run == 'true' && needs.mobile-credentials-preflight.result == 'success'"
    );
    assert.equal(job.environment, 'mobile-store-beta');
    assert.equal(job.defaults.run['working-directory'], 'apps/mobile');
    assert.equal(
      job.permissions,
      undefined,
      'Publish jobs must inherit workflow OIDC permissions'
    );
    const fetchStep = step(
      job,
      `Fetch ${platform === 'ios' ? 'iOS' : 'Android'} deployment bundle from Tuturuuu`
    );
    assert.ok(
      fetchStep.run.includes(
        `https://infrastructure.tuturuuu.com/api/v1/mobile-deployment/bundle?environment=production&platform=${platform}`
      )
    );
    assert.ok(fetchStep.run.includes('audience=tuturuuu-mobile-deployment'));
    assert.ok(fetchStep.run.includes('X-GitHub-OIDC-Token'));
    assert.ok(fetchStep.run.includes('hydrate-bundle.mjs'));
    assert.equal(
      step(
        job,
        `Cleanup ${platform === 'ios' ? 'iOS' : 'Android'} release files`
      ).if,
      'always()'
    );
  }
  const android = parsed.jobs['publish-android-internal'];
  const publish = step(
    android,
    'Publish Android App Bundle to Google Play internal'
  );
  assert.equal(publish.with.track, 'internal');
  assert.equal(publish.with.status, 'completed');
  assert.equal(
    publish.with.releaseFiles,
    'apps/mobile/build/app/outputs/bundle/productionRelease/app-production-release.aab'
  );
  assert.match(
    step(android, 'Verify committed Google Play internal release').run,
    /verify-store\.mjs android/
  );
  const ios = parsed.jobs['publish-ios-testflight'];
  assert.match(
    step(ios, 'Upload iOS IPA to TestFlight').run,
    /xcrun altool --upload-app/
  );
  assert.match(
    step(ios, 'Verify TestFlight and distribute to beta groups').run,
    /verify-store\.mjs ios/
  );
  const betaStep = step(ios, 'Verify TestFlight and distribute to beta groups');
  assert.equal(
    betaStep.env.TESTFLIGHT_BETA_ENABLED,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    "${{ vars.TESTFLIGHT_BETA_ENABLED || 'true' }}"
  );
  assert.equal(
    betaStep.env.TESTFLIGHT_BETA_GROUPS,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    "${{ vars.TESTFLIGHT_BETA_GROUPS || 'all' }}"
  );
  assert.equal(
    betaStep.env.TESTFLIGHT_BETA_WHATS_NEW,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    '${{ vars.TESTFLIGHT_BETA_WHATS_NEW }}'
  );
  const retry = parsed.jobs['retry-ios-testflight-review'];
  assert.equal(retry.environment, 'mobile-store-beta');
  assert.equal(
    retry.if,
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/production' && needs.check-ci.outputs.should_run == 'true'"
  );
  assert.match(
    step(retry, 'Retry newest eligible build').run,
    /verify-store\.mjs ios-pending/
  );
  assert.match(
    step(retry, 'Fetch iOS deployment credentials').run,
    /audience=tuturuuu-mobile-deployment/
  );
  assert.equal(step(retry, 'Cleanup iOS release files').if, 'always()');
  assert.equal(
    step(ios, 'Upload iOS IPA artifact').with.path,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression
    '${{ steps.ios-ipa.outputs.path }}'
  );

  assert.match(workflow, /^on:\n {2}push:\n/m);
  assert.match(workflow, /^ {2}workflow_dispatch:/m);
  assert.match(workflow, /branches:\n\s+- production/);
  assert.match(workflow, /environment: mobile-store-beta/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /mobile-credentials-preflight:/);
  assert.match(workflow, /name: Check mobile deployment credentials/);
  assert.doesNotMatch(workflow, /has_ci_token/);
  assert.match(
    workflow,
    /::error title=Mobile store deployment blocked::MOBILE_DEPLOYMENT_CI_TOKEN is not configured/
  );
  assert.match(
    workflow,
    /publish-android-internal:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: github\.event_name == 'push' && needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.result == 'success'/
  );
  assert.match(
    workflow,
    /publish-ios-testflight:[\s\S]*?needs: \[check-ci, mobile-credentials-preflight\][\s\S]*?if: github\.event_name == 'push' && needs\.check-ci\.outputs\.should_run == 'true' && needs\.mobile-credentials-preflight\.result == 'success'/
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
  assert.match(
    workflow,
    /--build-name=\$\{\{ needs\.mobile-credentials-preflight\.outputs\.build_name \}\}/
  );
  assert.match(workflow, /CFBundleShortVersionString/);
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

test('TestFlight scheduler dispatches only promoted production retry code', () => {
  const workflowName = 'mobile-testflight-review-queue.yaml';
  const workflowPath = path.join(
    repoRoot,
    '.github',
    'workflows',
    workflowName
  );
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(
    ciConfig,
    /["']mobile-testflight-review-queue\.yaml["']:\s*true/
  );
  const parsed = JSON.parse(
    execFileSync(
      'ruby',
      [
        '-e',
        "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV.fetch(0)))",
        workflowPath,
      ],
      { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }
    )
  );
  assert.deepEqual(Object.keys(parsed.true), ['schedule', 'workflow_dispatch']);
  assert.deepEqual(parsed.permissions, {
    actions: 'write',
    contents: 'read',
    deployments: 'read',
  });
  assert.equal(parsed.jobs.dispatch.needs[0], 'check-ci');
  const steps = parsed.jobs.dispatch.steps;
  const promoted = steps.find(
    (step) => step.name === 'Require promoted retry code'
  );
  assert.match(promoted.run, /git fetch origin production/);
  assert.match(
    promoted.run,
    /git cat-file -e FETCH_HEAD:\.github\/workflows\/mobile-testflight-review-queue\.yaml/
  );
  const dispatch = steps.find(
    (step) => step.name === 'Dispatch production review retry'
  );
  assert.equal(dispatch.if, "steps.promoted.outputs.enabled == 'true'");
  assert.match(
    dispatch.run,
    /mobile-deploy-stores\.yaml\/dispatches -f ref=production/
  );
  assert.doesNotMatch(workflow, /MOBILE_DEPLOYMENT_CI_TOKEN/);
  assert.doesNotMatch(workflow, /audience=tuturuuu-mobile-deployment/);
  assert.doesNotMatch(workflow, /xcrun altool --upload-app/);
  assert.doesNotMatch(workflow, /betaAppReviewSubmissions.*DELETE/);
  for (const match of workflow.matchAll(/uses:\s*([^\s]+)/g)) {
    const action = match[1];
    if (!action || action.startsWith('./')) continue;
    assert.match(action.split('@')[1] || '', /^[0-9a-f]{40}$/);
  }
});
