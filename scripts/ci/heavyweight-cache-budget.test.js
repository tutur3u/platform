const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { readAllWorkflows } = require('./workflow-yaml-test-helper.js');

const workflows = readAllWorkflows();
const actions = JSON.parse(
  execFileSync(
    'bun',
    [
      '-e',
      `
    const fs = require('node:fs');
    const out = {};
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(file);
        else if (/^action\\.ya?ml$/.test(entry.name))
          out[file] = Bun.YAML.parse(fs.readFileSync(file, 'utf8'));
      }
    }
    walk('.github/actions');
    console.log(JSON.stringify(out));
  `,
    ],
    { encoding: 'utf8' }
  )
);

function heavyweightWriter(step, file) {
  if (
    step.uses?.startsWith('actions/setup-java@') &&
    step.with?.cache === 'gradle'
  )
    return true;
  if (step.uses?.startsWith('subosito/flutter-action@'))
    return [step.with?.cache, step.with?.['pub-cache']].some(
      (value) => value !== undefined && value !== false && value !== 'false'
    );
  return (
    /^actions\/cache(?:\/save)?@/.test(step.uses || '') &&
    /gradle|flutter|pub-cache|bun-deps|supabase-images|CocoaPods|CACHE-KEY|PUB-CACHE-KEY/i.test(
      `${file} ${step.with?.key} ${step.with?.path}`
    )
  );
}

function savePolicy(step, file) {
  const mobileDependencies = /gradle|CocoaPods/i.test(
    `${step.with?.key} ${step.with?.path}`
  );
  return {
    refs: file.startsWith('desktop-')
      ? ['refs/heads/main', 'refs/heads/production']
      : ['refs/heads/main'],
    events: mobileDependencies ? ['push'] : ['push', 'workflow_dispatch'],
  };
}

function assertTrustedSave(step, label, policy = savePolicy(step, label)) {
  assert.ok(
    step.if,
    `${label}: heavyweight cache writer needs a trusted-ref/event guard`
  );
  const expression = step.if
    .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
    .replace(/steps\.([\w-]+)\.outputs\.([\w-]+)/g, 'outputs["$1.$2"]');
  const evaluate = Function(
    'github',
    'outputs',
    'success',
    'always',
    `return !!(${expression})`
  );
  let admitted = false;
  for (const ref of [
    'refs/heads/main',
    'refs/heads/production',
    'refs/heads/feature/a',
    'refs/pull/7/merge',
  ]) {
    for (const event_name of [
      'push',
      'workflow_dispatch',
      'pull_request',
      'pull_request_target',
      'workflow_run',
      'schedule',
    ]) {
      for (const actor of ['contributor', 'dependabot[bot]']) {
        for (const value of ['true', 'false', '']) {
          // Treat output-based save flags as attacker-controlled: they cannot replace the trust guard.
          const outputs = new Proxy(
            {},
            { get: (_, key) => (key.endsWith('.cache-hit') ? 'false' : value) }
          );
          let saves;
          try {
            saves = evaluate(
              { ref, event_name, actor },
              outputs,
              () => true,
              () => true
            );
          } catch (error) {
            throw new Error(`${label}: unsupported save guard ${step.if}`, {
              cause: error,
            });
          }
          const trusted =
            policy.refs.includes(ref) && policy.events.includes(event_name);
          assert.ok(
            !saves || trusted,
            `${label}: cache save admitted ${event_name} on ${ref}`
          );
          admitted ||= saves;
        }
      }
    }
  }
  assert.ok(
    admitted,
    `${label}: save guard must allow a trusted cache producer`
  );
}

test('heavyweight workflow and composite cache writers only admit trusted pushes/dispatches', () => {
  let writers = 0;
  for (const [file, document] of Object.entries({ ...workflows, ...actions })) {
    const groups = document.runs
      ? [document.runs.steps]
      : Object.values(document.jobs).map((job) => job.steps || []);
    for (const steps of groups) {
      for (const step of steps) {
        if (!heavyweightWriter(step, file)) continue;
        writers++;
        const policy = savePolicy(step, file);
        if (step.uses.startsWith('subosito/flutter-action@')) {
          for (const field of ['cache', 'pub-cache']) {
            const guard = step.with?.[field];
            if (guard === undefined || guard === false || guard === 'false')
              continue;
            assertTrustedSave(
              { if: typeof guard === 'string' ? guard : step.if },
              `${file}: ${field}`,
              policy
            );
          }
        } else {
          assertTrustedSave(step, `${file}: ${step.name || step.uses}`, policy);
        }
      }
    }
  }
  assert.ok(
    writers >= 9,
    'must inspect Gradle, CocoaPods, Bun, Flutter SDK/pub and Supabase writers'
  );
});

test('Gradle restores never register setup-java post-job saves', () => {
  let restores = 0;
  for (const [file, document] of Object.entries({ ...workflows, ...actions })) {
    const groups = document.runs
      ? [document.runs.steps]
      : Object.values(document.jobs).map((job) => job.steps || []);
    for (const steps of groups) {
      for (const step of steps) {
        if (step.uses?.startsWith('actions/setup-java@'))
          assert.notEqual(
            step.with?.cache,
            'gradle',
            `${file}: use explicit restore and trusted save`
          );
        if (
          step.uses?.startsWith('actions/cache/restore@') &&
          step.with?.key?.startsWith('gradle-v1-')
        )
          restores++;
      }
    }
  }
  assert.equal(restores, 2);
});

test('mobile Gradle and CocoaPods saves use exactly the restored identity and paths', () => {
  let pairs = 0;
  for (const workflow of Object.values(workflows)) {
    for (const job of Object.values(workflow.jobs)) {
      const steps = job.steps || [];
      for (const restore of steps.filter((step) =>
        ['gradle-cache', 'pods-cache'].includes(step.id)
      )) {
        assert.match(restore.uses, /^actions\/cache\/restore@/);
        const save = steps.find(
          (step) =>
            step.uses?.startsWith('actions/cache/save@') &&
            step.with?.key === restore.with.key
        );
        assert.ok(save, `missing save for ${restore.name}`);
        assert.equal(save.with.path, restore.with.path);
        assert.match(
          save.if,
          /github.ref == 'refs\/heads\/main' && github.event_name == 'push'/
        );
        assert.equal(
          restore.if,
          undefined,
          'untrusted refs must still restore'
        );
        pairs++;
      }
    }
  }
  assert.equal(pairs, 5);
});

test('budget guard rejects implicit Gradle saves and incomplete or bypassed trust guards', () => {
  const step = { uses: 'actions/setup-java@sha', with: { cache: 'gradle' } };
  assert.ok(heavyweightWriter(step, 'android.yaml'));
  for (const guard of [
    undefined,
    "github.ref == 'refs/heads/main'",
    "github.event_name != 'pull_request'",
    "github.ref == 'refs/heads/main' && github.event_name == 'push' || true",
  ]) {
    assert.throws(() => assertTrustedSave({ ...step, if: guard }, 'fixture'));
  }
});

test('budget policies reject production saves outside desktop and dispatch saves for Gradle/Pods', () => {
  for (const file of [
    'bun/action.yml',
    'cache-supabase-images/action.yml',
    'setup-flutter-with-cache/action.yml',
  ]) {
    assert.throws(() =>
      assertTrustedSave(
        {
          if: "github.ref == 'refs/heads/production' && github.event_name == 'push'",
        },
        file
      )
    );
  }
  for (const dependency of ['~/.gradle/caches', '~/Library/Caches/CocoaPods']) {
    assert.throws(() =>
      assertTrustedSave(
        {
          with: { path: dependency },
          if: "github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'",
        },
        'mobile.yaml'
      )
    );
  }
});

test('Bun dependency keys and every fallback stay partitioned by the pinned version', () => {
  const action = actions['.github/actions/setup-bun-with-retry/action.yml'];
  const version = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
  ).packageManager.replace(/^bun@/, '');
  assert.equal(action.inputs['bun-version'].default, version);
  const deps = action.runs.steps.filter((step) =>
    step.with?.key?.startsWith('bun-deps-')
  );
  assert.equal(deps.length, 2);
  const expression = (body) => `\${{ ${body} }}`;
  for (const step of deps) {
    const prefix = `bun-deps-v1-${expression('runner.os')}-${expression('runner.arch')}-${expression('inputs.bun-version')}-`;
    assert.equal(
      step.with.key,
      `${prefix}${expression("hashFiles('bun.lock')")}`
    );
    assert.equal(step.with['restore-keys'].trim(), prefix);
  }
  for (const [name, workflow] of Object.entries(workflows))
    assert.doesNotMatch(
      JSON.stringify(workflow),
      /1\.4\.3/,
      `${name} still pins retired Bun 1.4.3`
    );
});
