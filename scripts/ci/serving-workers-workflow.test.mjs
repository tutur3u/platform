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

test('every serving app has a publish job that hands the token over', () => {
  for (const app of Object.keys(SERVING_WORKERS)) {
    const job = caller[`publish-${app}`];
    assert.ok(job, `publish-${app} exists`);
    assert.match(
      job,
      /^ {4}uses: \.\/\.github\/workflows\/serving-worker-publish\.yaml$/m,
      `publish-${app} calls the publisher`
    );
    assert.match(
      job,
      /^ {4}secrets: inherit$/m,
      `publish-${app} hands secrets over`
    );
    assert.match(job, new RegExp(`^ {6}app: ${app}$`, 'm'));
  }
});

test('broken variant: a publish job with no secrets key is caught', () => {
  const stripped = jobs(
    read('serving-workers-production.yaml').replace(
      /^ {4}secrets: inherit\n/gm,
      ''
    )
  );
  for (const app of Object.keys(SERVING_WORKERS))
    assert.doesNotMatch(stripped[`publish-${app}`], /^ {4}secrets:/m);
});
