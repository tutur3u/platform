const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Public dispatch workflows run on the default branch, so their runner cache
// scope is the trusted `main` scope. Admitted source code executes in that
// scope, which means no step may restore from or save to a shared cache, and no
// restore/save-capable step may run after the admitted source is checked out.
const workflows = {
  'public-merged-main-tests': {
    command: /^node \.\.\/control\/scripts\/ci\/public-test-shard\.js /,
  },
  'public-build-artifact': {
    command: /^node \.\.\/control\/scripts\/ci\/public-build\.js /,
  },
};

const workflowText = (name) =>
  fs.readFileSync(
    path.join(__dirname, '../../.github/workflows', `${name}.yaml`),
    'utf8'
  );

function parseJobs(text) {
  const lines = text.split('\n');
  const jobs = {};
  let job = null;
  let step = null;
  let inJobs = false;
  let inSteps = false;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const header = line.match(/^ {2}([\w-]+):\s*$/);
    if (header) {
      job = { name: header[1], head: [], steps: [] };
      jobs[job.name] = job;
      step = null;
      inSteps = false;
      continue;
    }
    if (!job) continue;
    if (/^ {4}steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }
    if (inSteps && /^ {6}- /.test(line)) {
      step = { lines: [line.replace(/^ {6}- /, '')] };
      job.steps.push(step);
      continue;
    }
    if (inSteps && step) step.lines.push(line.replace(/^ {8}/, ''));
    else job.head.push(line);
  }
  for (const j of Object.values(jobs))
    for (const s of j.steps) {
      const code = s.lines.filter((l) => !/^\s*#/.test(l)).join('\n');
      s.text = code;
      s.uses = code.match(/^uses: (\S+)/m)?.[1];
      s.name = code.match(/^name: (.+)$/m)?.[1];
      s.run = code.match(/^run: (.+)$/m)?.[1]?.trim();
      s.workingDirectory = code.match(/^working-directory: (\S+)/m)?.[1];
    }
  return jobs;
}

const cacheCapable =
  /^(?:actions\/(?:cache|setup-[\w-]+)|[\w-]+\/setup-[\w-]+|[\w-]+\/cache[\w/-]*)@/;
const credential =
  /secrets\.|github\.token|GITHUB_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_CACHE_URL|ACTIONS_RESULTS_URL|ACTIONS_ID_TOKEN/;

// Returns the list of cache-trust violations for one workflow's text.
function violations(text, commandPattern) {
  const found = [];
  const add = (message) => found.push(message);
  if (
    !/^on:\n {2}workflow_dispatch:/m.test(text) ||
    /pull_request|workflow_run|schedule:|push:/.test(
      text.split(/^permissions:/m)[0]
    )
  )
    add('workflow must trigger only on workflow_dispatch');
  if (
    /restore-keys|actions\/cache|cache-dependency-path|^\s*cache: /m.test(text)
  )
    add('shared cache restore or save is declared');
  if (
    !/^permissions:\n {2}contents: read\n {2}actions: read\n/m.test(text) ||
    /^[ \t]+permissions:/m.test(text)
  )
    add(
      'permissions must stay read-only at workflow level with no job override'
    );
  const jobs = parseJobs(text);
  for (const job of Object.values(jobs)) {
    const sourceIndex = job.steps.findIndex(
      (s) => s.name === 'Checkout admitted source'
    );
    const controlIndex = job.steps.findIndex(
      (s) => s.name === 'Checkout immutable workflow controls'
    );
    for (const [i, s] of job.steps.entries()) {
      if (
        s.uses &&
        /^actions\/setup-node@/.test(s.uses) &&
        !/^ {2}package-manager-cache: false$/m.test(s.text)
      )
        add(
          `${job.name}: setup-node must disable automatic package-manager cache`
        );
      if (sourceIndex === -1) continue;
      if (i <= sourceIndex) continue;
      if (s.uses && cacheCapable.test(s.uses))
        add(
          `${job.name}: restore/save-capable action after source checkout: ${s.uses}`
        );
      if (s.uses && /^actions\/github-script@/.test(s.uses))
        add(`${job.name}: script action after source checkout`);
      if (credential.test(s.text))
        add(
          `${job.name}: credential reachable after source checkout in "${s.name ?? s.uses}"`
        );
      if (/setup-bun-with-backoff|curl |wget /.test(s.text))
        add(`${job.name}: tool installation after source checkout`);
    }
    if (sourceIndex !== -1) {
      if (controlIndex === -1 || controlIndex > sourceIndex)
        add(`${job.name}: controls must be checked out before source`);
      const after = job.steps.slice(sourceIndex + 1);
      const allowed = after.filter(
        (s) =>
          /^Verify both immutable checkout identities/.test(s.name ?? '') ||
          (s.run &&
            commandPattern.test(s.run) &&
            s.workingDirectory === 'source') ||
          /^actions\/upload-artifact@/.test(s.uses ?? '')
      );
      if (allowed.length !== after.length)
        add(`${job.name}: unexpected step after source checkout`);
      const bun = job.steps.findIndex((s) =>
        /setup-bun-with-backoff/.test(s.text)
      );
      if (bun === -1 || bun > sourceIndex)
        add(`${job.name}: Bun setup must precede source checkout`);
      else if (job.steps[bun].workingDirectory !== 'control')
        add(`${job.name}: Bun setup must run from immutable controls`);
      if (
        /^ {4}(?:env|environment|permissions):[\s\S]*(?:secrets\.)/m.test(
          job.head.join('\n')
        )
      )
        add(`${job.name}: job env exposes secrets`);
    }
  }
  return found;
}

for (const [name, { command }] of Object.entries(workflows)) {
  test(`${name}: admitted source runs without any cache restore/save or credential path`, () => {
    assert.deepEqual(violations(workflowText(name), command), []);
  });

  test(`${name}: safe reuse stays on control-only setup that precedes source checkout`, () => {
    const jobs = parseJobs(workflowText(name));
    const job = Object.values(jobs).find((j) =>
      j.steps.some((s) => s.name === 'Checkout admitted source')
    );
    const names = job.steps.map((s) => s.name ?? s.uses.split('@')[0]);
    const source = names.indexOf('Checkout admitted source');
    assert.ok(names.indexOf('Checkout immutable workflow controls') === 0);
    assert.ok(names.indexOf('actions/setup-node') > 0);
    assert.ok(names.indexOf('actions/setup-node') < source);
    assert.ok(names.findIndex((n) => /^Setup pinned Bun/.test(n)) < source);
    assert.equal(
      names.at(-1),
      job.steps.at(-1).name ?? 'actions/upload-artifact'
    );
    assert.ok(job.steps.at(-1).uses.startsWith('actions/upload-artifact@'));
  });

  test(`${name}: no pull_request or fork-code trigger can seed the default-branch scope`, () => {
    const text = workflowText(name);
    const triggers = text.split(/^permissions:/m)[0];
    assert.match(triggers, /^on:\n {2}workflow_dispatch:/m);
    assert.ok(
      !/pull_request|workflow_run|issue_comment|schedule:|push:/.test(triggers)
    );
    assert.ok(
      !/pull_request_target|self-hosted|environment:|secrets[.:]/.test(text)
    );
  });

  test(`${name}: mutated workflows that reopen a cache or credential path are rejected`, () => {
    const text = workflowText(name);
    const mutate = (from, to) => {
      assert.ok(text.includes(from), `fixture anchor missing: ${from}`);
      return text.replace(from, to);
    };
    const cases = {
      'setup-node auto cache': mutate(
        '          package-manager-cache: false\n',
        ''
      ),
      'bun setup after source': (() => {
        const bun = text.match(
          /      - name: Setup pinned Bun[^\n]*\n {8}working-directory: control\n {8}run: [^\n]*\n/
        )[0];
        return text
          .replace(bun, '')
          .replace(
            /(      - name: Verify both immutable checkout identities[\s\S]*?SOURCE_SHA"\n)/,
            `$1${bun}`
          );
      })(),
      'cache restore with prefix fallback after source': mutate(
        '      - name: Verify both immutable checkout identities',
        '      - uses: actions/cache@0000000000000000000000000000000000000000\n        with:\n          path: ~/.bun\n          key: bun-${{ runner.os }}\n          restore-keys: bun-\n      - name: Verify both immutable checkout identities'
      ),
      'token after source': mutate(
        '      - name: Verify both immutable checkout identities',
        '      - name: Publish\n        run: echo "${{ secrets.EXAMPLE }}"\n      - name: Verify both immutable checkout identities'
      ),
      'runtime token env after source': mutate(
        '      - name: Verify both immutable checkout identities',
        '      - name: Leak\n        env:\n          T: ${{ github.token }}\n        run: true\n      - name: Verify both immutable checkout identities'
      ),
      'pull_request trigger': mutate(
        'on:\n  workflow_dispatch:',
        'on:\n  pull_request:\n  workflow_dispatch:'
      ),
    };
    for (const [label, mutated] of Object.entries(cases))
      assert.notDeepEqual(
        violations(mutated, command),
        [],
        `${label} must be rejected`
      );
  });
}
