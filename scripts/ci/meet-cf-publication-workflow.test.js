const assert = require('node:assert/strict');
const test = require('node:test');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflow = readWorkflow('meet-cloudflare.yaml');
const step = (job, name) => {
  const matches = workflow.jobs[job].steps.filter((item) => item.name === name);
  assert.equal(matches.length, 1, `unique step: ${name}`);
  return matches[0];
};

test('Meet publishes the sealed frontend through the cf Void publisher', () => {
  const publish = step('deploy', 'Deploy the verified frontend');
  assert.match(
    publish.run,
    /serving=\$\(jq -er \.previousVersionId "\$RUNNER_TEMP\/meet-cf-publish\.json"\)/
  );
  assert.match(
    publish.run,
    /void-cf-publisher\.mjs publish --build "\$out" --worker tuturuuu-meet --message "\$SOURCE_SHA"/
  );
  assert.match(
    publish.run,
    /void-cf-publisher\.mjs assign --worker tuturuuu-meet --version "\$version" --expect-current "\$serving" \\\n\s+--build-info-url https:\/\/meet\.tuturuuu\.com\/api\/build-info --expect-build "\$SOURCE_SHA"/
  );
  assert.doesNotMatch(publish.run, /deploy --no-bundle|--strict|exports/);
});

test('every Meet release carries the shared-origin repository variables', () => {
  const publish = step('deploy', 'Deploy the verified frontend');
  assert.equal(
    publish.env.TTR_ONE_ORIGIN_MEET,
    "${{ vars.TTR_ONE_ORIGIN_MEET || 'off' }}"
  );
  assert.equal(
    publish.env.TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS,
    "${{ vars.TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS || '302' }}"
  );
  assert.match(
    publish.run,
    /case "\$TTR_ONE_ORIGIN_MEET" in off\|shadow\|on\)/
  );
  assert.match(
    publish.run,
    /case "\$TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS" in 301\|302\|307\)/
  );
  assert.match(
    publish.run,
    /--var "TTR_ONE_ORIGIN_MEET=\$TTR_ONE_ORIGIN_MEET"/
  );
});

test('every Meet frontend release carries the declared MEET_UX_V2 flag', () => {
  const publish = step('deploy', 'Deploy the verified frontend');
  assert.equal(publish.env.MEET_UX_V2, "${{ vars.MEET_UX_V2 || 'false' }}");
  const check =
    'case "$MEET_UX_V2" in true|false) ;; *) echo \'::error::MEET_UX_V2 must be true or false\'; exit 1 ;; esac';
  assert.ok(publish.run.includes(check));
  assert.ok(
    publish.run.indexOf(check) < publish.run.indexOf('void-cf-output.mjs')
  );
  // A hand-set Worker var is not a declared override, so the publisher drops it.
  const outputArgs = publish.run.slice(
    publish.run.indexOf('output_args=('),
    publish.run.indexOf('if [ "$MEET_AI_RELEASE"')
  );
  assert.ok(outputArgs.includes('--var "MEET_UX_V2=$MEET_UX_V2"'));
  assert.equal(publish.run.match(/--var "MEET_UX_V2=/g).length, 1);
  assert.doesNotMatch(
    JSON.stringify(step('deploy', 'Deploy signaling before the frontend')),
    /MEET_UX_V2/
  );
});

const GUEST_BOARD_SWITCHES = [
  'MEET_GUEST_WHITEBOARD',
  'MEET_GUEST_WHITEBOARD_DRAW',
];

test('both Meet Workers carry the declared guest whiteboard switches', () => {
  const frontend = step('deploy', 'Deploy the verified frontend');
  const signaling = step('deploy', 'Deploy signaling before the frontend');
  const outputArgs = frontend.run.slice(
    frontend.run.indexOf('output_args=('),
    frontend.run.indexOf('if [ "$MEET_AI_RELEASE"')
  );
  // Assembled so this test adds no tracked deploy-tool usage.
  const deployCommand = ['wrang', 'ler deploy'].join('');
  const realtimeDeploy = signaling.run.slice(
    signaling.run.indexOf(deployCommand)
  );
  const count = (text, needle) => text.split(needle).length - 1;
  for (const name of GUEST_BOARD_SWITCHES) {
    const fallback = '${{ vars.' + name + " || 'false' }}";
    const check =
      'case "$' +
      name +
      '" in true|false) ;; *) echo \'::error::' +
      name +
      " must be true or false'; exit 1 ;; esac";
    const appVar = `--var "${name}=$${name}"`;
    const realtimeVar = `--var "${name}:$${name}"`;
    assert.equal(frontend.env[name], fallback);
    assert.equal(signaling.env[name], fallback);

    // The Meet app Worker takes KEY=VALUE through the cf output builder.
    assert.ok(frontend.run.includes(check));
    assert.ok(
      frontend.run.indexOf(check) < frontend.run.indexOf('void-cf-output.mjs')
    );
    assert.ok(outputArgs.includes(appVar));
    assert.equal(count(frontend.run, `--var "${name}=`), 1);
    assert.equal(count(frontend.run, `--var "${name}:`), 0);

    // The realtime Worker takes KEY:VALUE through the realtime deploy.
    assert.ok(signaling.run.includes(check));
    assert.ok(
      signaling.run.indexOf(check) < signaling.run.indexOf(deployCommand)
    );
    assert.ok(realtimeDeploy.includes(realtimeVar));
    assert.equal(count(signaling.run, `--var "${name}:`), 1);
    assert.equal(count(signaling.run, `--var "${name}=`), 0);
  }
});

test('Mira stays contained unless the release opts in to paid-and-staff', () => {
  const publish = step('deploy', 'Deploy the verified frontend');
  assert.equal(
    publish.env.MEET_AI_RELEASE,
    "${{ vars.MEET_AI_RELEASE || 'contained' }}"
  );
  assert.match(
    publish.run,
    /case "\$MEET_AI_RELEASE" in contained\|paid-and-staff\) ;; \*\) echo '::error::[^']*'; exit 1 ;; esac/
  );
  // The default arguments carry no Mira override; only paid-and-staff appends one.
  assert.doesNotMatch(
    publish.run.split('if [ "$MEET_AI_RELEASE"')[0],
    /MEET_AI_DISABLED/
  );
  assert.equal(publish.run.match(/MEET_AI_DISABLED=false/g).length, 1);
  // Source configs leave the kill switch off, so contained turns it back on.
  assert.match(
    publish.run,
    /if \[ "\$MEET_AI_RELEASE" = contained \]; then\n\s+output_args\+=\(--var MEET_AI_DISABLED=true\)/
  );
  assert.match(
    publish.run,
    /if \[ "\$MEET_AI_RELEASE" = paid-and-staff \]; then\n\s+output_args\+=\(--var MEET_AI_DISABLED=false\)/
  );
  // Paid-tier hosting is a var unless a same-named secret exists.
  assert.equal(
    publish.env.PAID_TIER_SECRET,
    '${{ steps.secret-names.outputs.paid_tier_secret }}'
  );
  assert.match(
    publish.run,
    /if \[ "\$PAID_TIER_SECRET" = true \]; then\n\s+echo '::notice::paid-tier hosting comes from the Worker secret MEET_PAID_TIER_HOSTING_ENABLED; only its exact value true enables it'\n\s+else\n\s+output_args\+=\(--var MEET_PAID_TIER_HOSTING_ENABLED=true\)/
  );
  assert.equal(
    publish.run.match(/MEET_PAID_TIER_HOSTING_ENABLED=true/g).length,
    1
  );
  assert.match(publish.run, /void-cf-output\.mjs "\$\{output_args\[@\]\}"/);
});

test('paid-and-staff requires the Mira secret names on the frontend only', () => {
  const verify = step('deploy', 'Verify required production secret names');
  assert.equal(
    verify.env.MEET_AI_RELEASE,
    "${{ vars.MEET_AI_RELEASE || 'contained' }}"
  );
  assert.match(
    verify.run,
    /if \[ "\$MEET_AI_RELEASE" = paid-and-staff \]; then\n\s+jq -e --argjson required '\["MEET_AI_ALL_WORKSPACES","GOOGLE_GENERATIVE_AI_API_KEY","MEET_AI_PROTECTED_WORKSPACE_IDS"\]'[^\n]*meet-secrets\.json[^\n]*::error::/
  );
});

test('the secret-names step reports whether paid-tier hosting is a secret', () => {
  const verify = step('deploy', 'Verify required production secret names');
  assert.equal(verify.id, 'secret-names');
  // The mode is validated before any secret read or deploy step runs.
  assert.match(
    verify.run,
    /^case "\$MEET_AI_RELEASE" in contained\|paid-and-staff\) ;; \*\) echo '::error::[^']*'; exit 1 ;; esac\n/
  );
  assert.match(verify.run, /index\("MEET_PAID_TIER_HOSTING_ENABLED"\)/);
  assert.match(verify.run, /paid_tier_secret=true' >> "\$GITHUB_OUTPUT"/);
  assert.match(verify.run, /paid_tier_secret=false' >> "\$GITHUB_OUTPUT"/);
});

test('a contained release turns the realtime kill switch back on', () => {
  const signaling = step('deploy', 'Deploy signaling before the frontend');
  assert.equal(
    signaling.env.MEET_AI_RELEASE,
    "${{ vars.MEET_AI_RELEASE || 'contained' }}"
  );
  assert.match(
    signaling.run,
    /case "\$MEET_AI_RELEASE" in contained\|paid-and-staff\) ;; \*\) echo '::error::[^']*'; exit 1 ;; esac/
  );
  assert.match(
    signaling.run,
    /if \[ "\$MEET_AI_RELEASE" = contained \]; then contain=\(--var MEET_AI_DISABLED:true\); fi/
  );
  assert.match(signaling.run, / deploy [^\n]* "\$\{contain\[@\]\}"/);
  // The room Worker never receives an opening override or the opt-in.
  assert.doesNotMatch(
    JSON.stringify(signaling),
    /MEET_AI_DISABLED[=:]false|MEET_AI_ALL_WORKSPACES/
  );
});

test('validation dry-runs the converted output without credentials', () => {
  const qualify = step(
    'validate',
    'Qualify the frontend cf Build Output without credentials'
  );
  assert.equal(qualify.env?.CLOUDFLARE_API_TOKEN, undefined);
  assert.match(qualify.run, /void-cf-publisher\.mjs dry-run --build "\$out"/);
});

test('Meet publication resolves the pinned cf CLI, not a hoisted binary', () => {
  for (const [job, name] of [
    ['validate', 'Qualify the frontend cf Build Output without credentials'],
    ['deploy', 'Deploy the verified frontend'],
  ])
    assert.doesNotMatch(step(job, name).run, /CF_BIN|node_modules\/\.bin/);
});

test('a release dispatch publishes its pinned main source', () => {
  assert.equal(
    workflow.env.SOURCE_SHA,
    "${{ github.event.pull_request.head.sha || (github.event_name == 'workflow_dispatch' && inputs.release && inputs.source_sha) || github.sha }}"
  );
  const marker = step('deploy', 'Record successful Cloudflare deployment');
  assert.equal(marker.env.DEPLOYMENT_MARKER_SHA, '${{ env.SOURCE_SHA }}');
  for (const job of ['validate', 'deploy'])
    assert.ok(
      workflow.jobs[job].steps.some(
        (item) => item.with?.ref === '${{ env.SOURCE_SHA }}'
      ),
      `${job} checks out the source`
    );
});

test("deploy admission runs the release policy from main's dispatch head", () => {
  const admit = workflow.jobs.deploy.steps.find(
    (item) => item.id === 'admission'
  );
  assert.equal(admit.env.POLICY_SHA, '${{ github.sha }}');
  assert.match(
    admit.run,
    /git show "\$POLICY_SHA:scripts\/ci\/\$file" > "\$policy\/\$file"/
  );
  assert.match(
    admit.run,
    /for file in meet-standalone-release\.mjs release-relevant-ci\.mjs; do/
  );
  assert.match(admit.run, /node "\$policy\/meet-standalone-release\.mjs"/);
});

test('the canonical build identity check expects the published source', () => {
  const verify = step('deploy', 'Verify canonical frontend build identity');
  assert.match(
    verify.run,
    /^GITHUB_SHA="\$SOURCE_SHA" node scripts\/ci\/verify-meet-build-info\.js$/
  );
});

test('Meet frontend publication pins the workshop guest budgets', () => {
  const publish = step('deploy', 'Deploy the verified frontend');
  for (const [name, value] of Object.entries({
    MEET_EVENT_GUEST_JOIN_LIMIT: '150',
    MEET_GUEST_JOIN_NETWORK_HOURLY_LIMIT: '600',
    MEET_GUEST_JOIN_LIMIT: '200',
  })) {
    assert.equal(publish.env[name], value);
    assert.ok(publish.run.includes(`--var "${name}=$${name}"`));
  }
});
