/**
 * The serving-Workers publication workflows, read as text. The publisher runs
 * in a called workflow and authenticates with an environment secret; a called
 * workflow reads a secret only when its caller hands secrets over. A publish
 * job without that hand-over starts with an empty token and stops at
 * "Cloudflare deploy credentials are not configured".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SERVING_WORKERS } from './serving-workers-apps.mjs';

const read = (name) =>
  readFileSync(
    new URL(`../../.github/workflows/${name}`, import.meta.url),
    'utf8'
  );

/** A workflow's jobs as { name: text of the job's block }. */
function jobs(workflow) {
  const body = workflow.slice(
    workflow.indexOf('\njobs:\n') + '\njobs:\n'.length
  );
  const blocks = {};
  let name;
  for (const line of body.split('\n')) {
    const start = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (start) {
      name = start[1];
      blocks[name] = '';
    } else if (name) blocks[name] += `${line}\n`;
  }
  return blocks;
}

const TOKEN = 'SERVING_WORKERS_CLOUDFLARE_API_TOKEN';
const caller = jobs(read('serving-workers-production.yaml'));
const publisher = read('serving-worker-publish.yaml');

test('the publisher reads its token from the release environment', () => {
  const publish = jobs(publisher).publish;
  assert.match(publish, /^ {4}environment: cloudflare-release-production$/m);
  assert.match(
    publish,
    new RegExp(`CLOUDFLARE_API_TOKEN: \\$\\{\\{ secrets\\.${TOKEN} \\}\\}`)
  );
});

test('one publish matrix needs every build and hands the token over', () => {
  const publish = caller.publish;
  assert.ok(publish, 'publish exists');
  assert.match(
    publish,
    /^ {4}uses: \.\/\.github\/workflows\/serving-worker-publish\.yaml$/m
  );
  assert.match(publish, /^ {4}secrets: inherit$/m);
  assert.match(publish, /^ {6}id-token: write$/m);
  assert.ok(
    publish.includes(
      "build-ready: ${{ needs[format('build-{0}', matrix.app)].result == 'success' }}"
    )
  );
  assert.match(jobs(publisher).publish, /&& inputs\.build-ready/);
  assert.match(
    publish,
    /include: \$\{\{ fromJSON\(needs\.plan\.outputs\.matrix\) \}\}/
  );
  // Every leg waits for every build, so all legs pend on the release
  // environment together and one approval admits the round.
  const needs = /^ {4}needs: \[(.*)\]$/m.exec(publish)[1].split(/,\s*/);
  for (const app of Object.keys(SERVING_WORKERS)) {
    assert.ok(caller[`build-${app}`], `build-${app} exists`);
    assert.match(caller[`build-${app}`], /^ {6}actions: read$/m);
    assert.ok(needs.includes(`build-${app}`), `publish needs build-${app}`);
    assert.ok(!caller[`publish-${app}`], `no separate publish-${app} job`);
  }
});

test('planning waits for no approval and reads no secret', () => {
  assert.doesNotMatch(caller.plan, /environment:/);
  assert.doesNotMatch(caller.plan, /secrets\./);
  assert.match(caller.plan, /fleet-freshness\.mjs gate/);
  // Only full publish rounds are gated.
  assert.match(caller.plan, /\(inputs\.app \|\| 'all'\) == 'all'/);
});

test('only a full publish round names its summary fleet-summary', () => {
  assert.match(
    caller['fleet-summary'],
    /name: \$\{\{ \(\(inputs\.app \|\| 'all'\) == 'all'\) && 'fleet-summary' \|\| 'fleet-summary-partial' \}\}/
  );
});

test('the fleet summary runs after publication with no environment or Cloudflare token', () => {
  const summary = caller['fleet-summary'];
  assert.match(summary, /^ {4}needs: \[plan, publish, build-roadmap,/m);
  assert.match(summary, /always\(\)/);
  assert.doesNotMatch(summary, /environment:/);
  assert.doesNotMatch(summary, /secrets/);
  assert.match(summary, /fleet-freshness\.mjs summary/);
  // The pipeline wait reads the Actions API with the run's own token.
  assert.match(summary, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  const timeout = Number(/timeout-minutes: (\d+)/.exec(summary)[1]);
  assert.ok(timeout >= 25, 'room for the 10-minute wait plus probes');
});

test('the dispatch app choices are exactly the serving apps', () => {
  const options = /options: \[all, (.*)\]/.exec(
    read('serving-workers-production.yaml')
  )[1];
  assert.deepEqual(
    options.split(', ').sort(),
    Object.keys(SERVING_WORKERS).sort()
  );
});

test('broken variant: a publish job with no secrets key is caught', () => {
  const stripped = jobs(
    read('serving-workers-production.yaml').replace(
      /^ {4}secrets: inherit\n/gm,
      ''
    )
  );
  assert.doesNotMatch(stripped.publish, /^ {4}secrets:/m);
});

test('partial rounds are named so the gate skips them without a jobs read', () => {
  const workflow = read('serving-workers-production.yaml');
  assert.match(
    workflow,
    /^run-name: .*format\('Serving Workers Production \(partial \{0\}\)', inputs\.app\)/m
  );
});

test('a coordinator skip also skips reading the missing build artifact', () => {
  assert.match(
    publisher,
    /name: Record the artifact digest for the receipt\n +if: steps\.coordinator\.outputs\.publish != 'false'/
  );
});
