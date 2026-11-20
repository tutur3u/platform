import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const DIR = new URL(
  '../../plugins/tuturuuu/skills/tuturuuu-rollout-recovery/references/perf-factory/',
  import.meta.url
);
const workflow = JSON.parse(
  readFileSync(new URL('workflow.json', DIR), 'utf8')
);
const stages = new Map(workflow.stages.map((stage) => [stage.id, stage]));

test('every agent stage has a prompt file that names its completion line', () => {
  for (const stage of workflow.stages.filter((s) => s.role !== 'human')) {
    const path = new URL(stage.prompt, DIR);
    assert.ok(existsSync(path), `${stage.id} prompt missing`);
    const text = readFileSync(path, 'utf8');
    assert.match(text, /Report\s+only\s+to\s+the\s+dispatcher/u, stage.id);
    assert.match(text, /Finish\s+with\s+one\s+line/u, stage.id);
  }
});

test('stage transitions resolve and reviewers run with fresh context', () => {
  const targets = new Set([
    ...stages.keys(),
    ...Object.keys(workflow.terminal),
  ]);
  for (const stage of workflow.stages) {
    for (const key of ['next', 'sendBack', 'reopen']) {
      if (stage[key]) assert.ok(targets.has(stage[key]), `${stage.id}.${key}`);
    }
    if (stage.role === 'reviewer')
      assert.equal(stage.freshContext, true, stage.id);
  }
  assert.equal(workflow.stages[0].id, 'investigate');
  assert.equal(stages.get('verify-post-deploy').reopen, 'investigate');
});

test('scheduled-task prompts settle their own thread', () => {
  for (const name of ['scheduled-detector.md', 'daily-agent-log-review.md']) {
    const text = readFileSync(new URL(name, DIR), 'utf8');
    assert.match(text, /t3_thread_organize/u, name);
    assert.match(text, /Never\s+message\s+other\s+threads/u, name);
  }
});
