const assert = require('node:assert/strict');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper');

// Bash never applies `set -e` to a command negated with `!`, so a check like
// `! grep -q forbidden file` that is not the script's last command can never
// fail the step. Write it as `if grep -q forbidden file; then exit 1; fi`.
function logicalLines(script) {
  const lines = [];
  let current = '';
  for (const raw of script.split('\n')) {
    const line = raw.trim();
    if (!current && (!line || line.startsWith('#'))) continue;
    if (line.endsWith('\\')) {
      current += `${line.slice(0, -1)} `;
      continue;
    }
    lines.push(current + line);
    current = '';
  }
  if (current) lines.push(current);
  return lines;
}

function violations(workflows) {
  const found = [];
  for (const [file, workflow] of Object.entries(workflows))
    for (const [jobId, job] of Object.entries(workflow?.jobs ?? {}))
      (job.steps ?? []).forEach((step, index) => {
        if (typeof step.run !== 'string') return;
        const lines = logicalLines(step.run);
        lines.forEach((line, position) => {
          if (/^!\s/u.test(line) && position !== lines.length - 1)
            found.push(`${file} ${jobId} step ${index + 1}: ${line}`);
        });
      });
  return found;
}

test('no workflow step relies on a negated command that set -e ignores', () => {
  assert.deepEqual(violations(readAllWorkflows(undefined, { raw: true })), []);
});

test('a negated check before the last command is reported; conditions are not', () => {
  const workflows = {
    'check.yaml': {
      jobs: {
        build: {
          steps: [
            { run: 'set -euo pipefail\n! grep -q bad out\necho done' },
            { run: 'set -euo pipefail\necho start\n! grep -q bad out' },
            {
              run: 'if [ -n "$A" ] || \\\n   ! [[ "$B" =~ ^x$ ]]; then\n  exit 1\nfi\necho ok',
            },
          ],
        },
      },
    },
  };
  assert.deepEqual(violations(workflows), [
    'check.yaml build step 1: ! grep -q bad out',
  ]);
});
