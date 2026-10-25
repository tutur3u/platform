const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readAllWorkflows } = require('./workflow-yaml-test-helper.js');
const {
  CACHE_PATHS,
  MAX_BYTES,
  downloadCacheBudget,
} = require('./gradle-cache-budget.js');

const expression = (body) => `\${{ ${body} }}`;
const key = `gradle-downloads-v2-${expression('runner.os')}-${expression('runner.arch')}-java17`;
const paths = '~/.gradle/wrapper/dists\n~/.gradle/caches/modules-2/files-2.1\n';

function assertGradleScope(step) {
  assert.deepEqual(step.with, { key, path: paths });
}

test('Gradle caches have one bounded main producer and two exact download-only consumers', () => {
  let restores = 0;
  let saves = 0;
  for (const [file, workflow] of Object.entries(readAllWorkflows())) {
    for (const [job, group] of Object.entries(workflow.jobs)) {
      for (const step of group.steps || []) {
        assert.ok(!step.uses?.startsWith('gradle/actions/setup-gradle@'));
        if (!/gradle/i.test(JSON.stringify(step.with || {}))) continue;
        if (!step.uses?.startsWith('actions/cache')) continue;
        assertGradleScope(step);
        if (step.uses.startsWith('actions/cache/restore@')) {
          restores++;
          continue;
        }
        saves++;
        assert.equal(file, 'mobile-build-android.yaml');
        assert.equal(job, 'build-android');
        assert.match(step.uses, /^actions\/cache\/save@/);
        assert.equal(
          step.if,
          "github.ref == 'refs/heads/main' && github.event_name == 'push' && steps.gradle-cache.outputs.cache-hit != 'true' && steps.gradle-budget.outputs.save == 'true'"
        );
        const budget = group.steps.find(
          (entry) => entry.id === 'gradle-budget'
        );
        assert.equal(budget.run, 'node scripts/ci/gradle-cache-budget.js');
        assert.equal(budget['working-directory'], '.');
        assert.ok(group.steps.indexOf(budget) < group.steps.indexOf(step));
        for (const event of ['push', 'pull_request'])
          assert.ok(
            workflow.on[event].paths.includes(
              'scripts/ci/gradle-cache-budget.js'
            )
          );
      }
    }
  }
  assert.equal(restores, 2);
  assert.equal(saves, 1);
  assert.deepEqual(
    `${CACHE_PATHS.map((entry) => `~/${entry}`).join('\n')}\n`,
    paths
  );
  assert.equal(MAX_BYTES, 512 * 1024 ** 2);
});

test('the budget guard rejects broad paths, old generations, fallback keys and hash churn', () => {
  const valid = { with: { key, path: paths } };
  assertGradleScope(valid);
  for (const withInputs of [
    { path: '~/.gradle/caches\n~/.gradle/wrapper\n' },
    { path: `${paths}~/.gradle/caches/transforms\n` },
    { key: 'gradle-v1-Linux-X64-java17-old' },
    { key: `${key}-${expression('hashFiles("**/*.gradle*")')}` },
    { 'restore-keys': 'gradle-v1-' },
  ])
    assert.throws(() =>
      assertGradleScope({ with: { ...valid.with, ...withInputs } })
    );
});

test('real size gate ignores build state, skips over-budget downloads and emits a save decision', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-budget-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  function file(relative, size) {
    const target = path.join(home, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const fd = fs.openSync(target, 'w');
    fs.ftruncateSync(fd, size);
    fs.closeSync(fd);
  }
  assert.deepEqual(downloadCacheBudget(home), { bytes: 0, save: false });
  for (const excluded of [
    'caches/transforms',
    'caches/build-cache-1',
    'daemon',
    'native',
  ])
    file(`.gradle/${excluded}/large`, MAX_BYTES * 2);
  file(`${CACHE_PATHS[0]}/gradle.zip`, 1024);
  file(`${CACHE_PATHS[1]}/module.jar`, 2048);
  const small = downloadCacheBudget(home);
  assert.equal(small.save, true);
  assert.ok(small.bytes >= 3072 && small.bytes < MAX_BYTES);
  // Cached links must not include the target's bytes outside the selected roots.
  fs.symlinkSync(
    path.join(home, '.gradle/native'),
    path.join(home, CACHE_PATHS[0], 'link')
  );
  assert.equal(downloadCacheBudget(home).save, true);
  file(`${CACHE_PATHS[1]}/large.jar`, MAX_BYTES + 1);
  assert.equal(downloadCacheBudget(home).save, false);
  const output = path.join(home, 'output');
  execFileSync(process.execPath, ['scripts/ci/gradle-cache-budget.js'], {
    env: { ...process.env, HOME: home, GITHUB_OUTPUT: output },
  });
  assert.match(fs.readFileSync(output, 'utf8'), /^save=false\nbytes=\d+\n$/);
});

test('Flutter SDK and pub caches have only platform/release identities and exact paths', () => {
  const action = JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        "console.log(JSON.stringify(Bun.YAML.parse(await Bun.file('.github/actions/setup-flutter-with-cache/action.yml').text())))",
      ],
      { encoding: 'utf8' }
    )
  );
  const caches = action.runs.steps.filter((step) =>
    step.uses.startsWith('actions/cache')
  );
  assert.equal(caches.length, 4);
  for (const step of caches) {
    assert.equal(step.with['restore-keys'], undefined);
    if (step.name.includes('SDK')) {
      assert.deepEqual(step.with, {
        path: expression('steps.identity.outputs.CACHE-PATH'),
        key: expression('steps.identity.outputs.CACHE-KEY'),
      });
    } else {
      assert.deepEqual(step.with, {
        path: expression('steps.identity.outputs.PUB-CACHE-PATH'),
        key: `flutter-pub-v2-${expression('runner.os')}-${expression('runner.arch')}-${expression('steps.identity.outputs.CHANNEL')}-${expression('steps.identity.outputs.VERSION')}`,
      });
    }
    assert.doesNotMatch(
      step.with.key,
      /hashFiles|github\.sha|run_id|run_attempt/
    );
  }
});
