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
