const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  evaluateExpression,
  renderTemplate,
} = require('./github-expression-test-helper');
const { readWorkflow } = require('./workflow-yaml-test-helper');

const workflows = [
  ['security-checks.yaml', 'secrets'],
  ['security-scan.yaml', 'secrets-diff'],
];
const expression = (value) => '$' + '{{ ' + value + ' }}';
const sha = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const imageDigest =
  'b109bc5f8f76a38196a3e413704fc5b9e3c32360bce4e4b603bd6f45b3721dbb';
const imageBinaryHash =
  '09d435057df51b800201bc3bbe0820554b1cac3cd98162e9e02b20c8b441b5bd';

function executable(file, contents) {
  fs.writeFileSync(file, contents, { mode: 0o755 });
}
function shaAdapter(bin) {
  if (process.platform !== 'darwin') return;
  // Ubuntu uses GNU sha256sum. macOS checks the same synthetic bytes with Node
  // because its sha256sum does not accept GNU long flags.
  executable(
    path.join(bin, 'sha256sum'),
    `#!${process.execPath}
const fs = require('node:fs');
const { createHash } = require('node:crypto');
require('node:assert/strict').deepEqual(process.argv.slice(2), ['--check', '--strict']);
const match = /^([a-f0-9]{64})  (.+)$/.exec(fs.readFileSync(0, 'utf8').trimEnd());
if (!match) process.exit(1);
const ok = createHash('sha256').update(fs.readFileSync(match[2])).digest('hex') === match[1];
console.log(match[2] + (ok ? ': OK' : ': FAILED'));
process.exit(ok ? 0 : 1);
`
  );
}

for (const [file, jobId] of workflows) {
  const workflow = readWorkflow(file, { raw: true });
  const job = workflow.jobs[jobId];
  const steps = job.steps;
  const install = steps.find(
    (s) => s.name === 'Install checksum-verified gitleaks'
  );
  const pins = { ...workflow.env, ...job.env };
  const caches = [
    [
      'release',
      'gitleaks-archive',
      'Save verified Gitleaks archive',
      'gitleaks-archive/gitleaks.tar.gz',
    ],
    [
      'image',
      'gitleaks-image',
      'Save verified Gitleaks image binary',
      'gitleaks-image/gitleaks',
    ],
  ].map(([source, id, name, suffix]) => ({
    source,
    id,
    suffix,
    restore: steps.find((s) => s.id === id),
    save: steps.find((s) => s.name === name),
  }));

  test(`${file}: immutable supplier identities and exact platform cache keys`, () => {
    assert.equal(pins.GITLEAKS_VERSION, '8.30.1');
    assert.equal(
      pins.GITLEAKS_SHA256,
      '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
    );
    assert.equal(pins.GITLEAKS_IMAGE_DIGEST, imageDigest);
    assert.equal(pins.GITLEAKS_IMAGE_BINARY_SHA256, imageBinaryHash);
    for (const { source, suffix, restore, save } of caches) {
      assert.equal(
        restore.uses,
        'actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
      );
      assert.equal(
        save.uses,
        'actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9'
      );
      const scope = { runner: { os: 'Linux', arch: 'X64' }, env: pins };
      const key = renderTemplate(restore.with.key, scope);
      assert.equal(
        key,
        source === 'release'
          ? `gitleaks-archive-v1-Linux-X64-8.30.1-${pins.GITLEAKS_SHA256}`
          : `gitleaks-image-binary-v1-Linux-X64-8.30.1-${imageDigest}-${imageBinaryHash}`
      );
      for (const [field, value] of [
        ['os', 'Windows'],
        ['arch', 'ARM64'],
      ]) {
        assert.notEqual(
          renderTemplate(restore.with.key, {
            ...scope,
            runner: { ...scope.runner, [field]: value },
          }),
          key
        );
      }
      for (const field of source === 'release'
        ? ['GITLEAKS_VERSION', 'GITLEAKS_SHA256']
        : [
            'GITLEAKS_VERSION',
            'GITLEAKS_IMAGE_DIGEST',
            'GITLEAKS_IMAGE_BINARY_SHA256',
          ]) {
        assert.notEqual(
          renderTemplate(restore.with.key, {
            ...scope,
            env: { ...pins, [field]: 'changed' },
          }),
          key
        );
      }
      assert.equal(restore.with.path, expression('runner.temp') + '/' + suffix);
      assert.equal(save.with.path, restore.with.path);
      assert.equal(save.with.key, restore.with.key);
      assert.equal(restore.with['restore-keys'], undefined);
      assert.ok(steps.indexOf(restore) < steps.indexOf(install));
      assert.ok(steps.indexOf(save) > steps.indexOf(install));
    }
    assert.equal(install.id, 'gitleaks');
    assert.deepEqual(install.env, { GH_TOKEN: expression('github.token') });
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    if (job.permissions)
      assert.deepEqual(job.permissions, { contents: 'read' });
    assert.doesNotMatch(install.run, /curl |secrets\.|auth login/);
    assert.equal(
      install.if,
      undefined,
      'all restored/downloaded bytes must be verified'
    );
    assert.match(
      install.run,
      /ghcr\.io\/gitleaks\/gitleaks@sha256:\$\{GITLEAKS_IMAGE_DIGEST\}/
    );
    assert.match(
      install.run,
      /timeout 180 docker pull --platform linux\/amd64/
    );
    assert.doesNotMatch(install.run, /docker run|go install|:latest/);
  });

  test(`${file}: only the verified selected supplier can warm a default-branch cache`, () => {
    for (const { source, id, save } of caches) {
      function allowed(event, ref, hit = 'false', selected = source) {
        return Boolean(
          evaluateExpression(save.if, {
            github: {
              event_name: event,
              ref,
              event: { repository: { default_branch: 'main' } },
            },
            steps: {
              [id]: { outputs: { 'cache-hit': hit } },
              gitleaks: { outputs: { source: selected } },
            },
          })
        );
      }
      for (const event of ['push', 'schedule', 'workflow_dispatch'])
        assert.equal(allowed(event, 'refs/heads/main'), true);
      assert.equal(allowed('pull_request', 'refs/pull/1/merge'), false);
      assert.equal(allowed('pull_request', 'refs/heads/main'), false);
      assert.equal(allowed('push', 'refs/heads/feature'), false);
      assert.equal(allowed('workflow_dispatch', 'refs/heads/feature'), false);
      assert.equal(allowed('push', 'refs/heads/main', 'true'), false);
      assert.equal(
        allowed(
          'push',
          'refs/heads/main',
          'false',
          source === 'image' ? 'release' : 'image'
        ),
        false
      );
      assert.equal(allowed('push', 'refs/heads/main', 'false', ''), false);
      assert.doesNotMatch(save.if, /always\(|failure\(/);
      assert.equal(save['continue-on-error'], undefined);
    }
  });

  const scenarios = [
    { name: 'release-hit', archive: 'valid', source: 'release' },
    { name: 'release-miss', source: 'release', download: true },
    { name: 'corrupt-release-hit', archive: 'corrupt', fail: true },
    {
      name: 'corrupt-release-download',
      download: true,
      corruptRelease: true,
      fail: true,
    },
    { name: 'image-hit', image: 'valid', source: 'image' },
    { name: 'corrupt-image-hit', image: 'corrupt', fail: true },
    {
      name: 'release-outage-image-fallback',
      download: true,
      downloadFail: true,
      docker: true,
      source: 'image',
    },
    {
      name: 'both-sources-fail',
      download: true,
      downloadFail: true,
      docker: true,
      dockerFail: 'pull',
      fail: true,
      exit: 42,
    },
    {
      name: 'image-pull-timeout',
      download: true,
      downloadFail: true,
      timeout: true,
      fail: true,
      exit: 124,
    },
    {
      name: 'image-create-fails',
      download: true,
      downloadFail: true,
      docker: true,
      dockerFail: 'create',
      fail: true,
      exit: 43,
    },
    {
      name: 'image-copy-fails',
      download: true,
      downloadFail: true,
      docker: true,
      dockerFail: 'cp',
      fail: true,
      exit: 44,
      cleanup: true,
    },
    {
      name: 'corrupt-image-download',
      download: true,
      downloadFail: true,
      docker: true,
      corruptImage: true,
      fail: true,
    },
    {
      name: 'wrong-image-version',
      download: true,
      downloadFail: true,
      docker: true,
      wrongVersion: 'image',
      fail: true,
      versionRan: true,
    },
    {
      name: 'wrong-release-version',
      download: true,
      wrongVersion: 'release',
      fail: true,
      versionRan: true,
    },
  ];
  for (const scenario of scenarios) {
    test(`${file}: bootstrap ${scenario.name}`, (t) => {
      const box = fs.mkdtempSync(path.join(os.tmpdir(), 'gitleaks-cache-'));
      t.after(() => fs.rmSync(box, { recursive: true, force: true }));
      const temp = path.join(box, 'temp');
      const bin = path.join(box, 'bin');
      const releaseDir = path.join(box, 'release');
      for (const dir of [temp, bin, releaseDir]) fs.mkdirSync(dir);
      function binary(label) {
        return `#!/bin/sh\n# ${label}\n[ "$1" = version ] || exit 98\n[ -z "\${GH_TOKEN:-}" ] && [ -z "\${GITHUB_TOKEN:-}" ] || exit 85\necho version >> "$VERSION_LOG"\necho ${scenario.wrongVersion === label ? '8.30.0' : '8.30.1'}\n`;
      }
      executable(path.join(releaseDir, 'gitleaks'), binary('release'));
      const imageFixture = path.join(box, 'image-fixture');
      executable(imageFixture, binary('image'));
      const fixture = path.join(box, 'fixture.tar.gz');
      execFileSync('tar', ['-czf', fixture, '-C', releaseDir, 'gitleaks']);
      const archive = path.join(temp, 'gitleaks-archive/gitleaks.tar.gz');
      const imageCache = path.join(temp, 'gitleaks-image/gitleaks');
      for (const [state, target, input] of [
        [scenario.archive, archive, fixture],
        [scenario.image, imageCache, imageFixture],
      ]) {
        if (state) {
          fs.mkdirSync(path.dirname(target));
          fs.writeFileSync(
            target,
            state === 'valid' ? fs.readFileSync(input) : 'corrupt'
          );
        }
      }
      const releaseLog = path.join(box, 'release-args');
      const dockerLog = path.join(box, 'docker-args');
      const versionLog = path.join(box, 'version-log');
      const output = path.join(box, 'output');
      executable(
        path.join(bin, 'gh'),
        `#!/bin/sh
[ "$GH_TOKEN" = fixture-auth ] || exit 88
printf '%s\\n' "$@" >> "$RELEASE_LOG"
echo attempt >> "$RELEASE_ATTEMPTS"
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then shift; target="$1"; fi
  shift
done
if [ "$RELEASE_FAIL" = true ]; then printf partial > "$target"; touch "$RELEASE_FAILURE"; exit 22; fi
if [ "$CORRUPT_RELEASE" = true ]; then printf corrupt > "$target"; else cp "$FIXTURE" "$target"; fi
`
      );
      executable(
        path.join(bin, 'timeout'),
        `#!/bin/sh
case "$1" in
  120) [ "$2" = gh ] || exit 96; shift; exec "$@" ;;
  180) [ -f "$RELEASE_FAILURE" ] || exit 95; shift
       if [ "$PULL_TIMEOUT" = true ]; then exit 124; fi
       exec "$@" ;;
  *) exit 87 ;;
esac
`
      );
      executable(
        path.join(bin, 'docker'),
        `#!/bin/sh
[ -f "$RELEASE_FAILURE" ] || exit 94
[ -z "\${GH_TOKEN:-}" ] && [ -z "\${GITHUB_TOKEN:-}" ] || exit 86
printf '%s\\n' "$*" >> "$DOCKER_LOG"
case "$1" in
  pull) [ "$*" = "pull --platform linux/amd64 $EXPECTED_IMAGE" ] || exit 93
        [ "$DOCKER_FAIL" != pull ] || exit 42 ;;
  create) [ "$*" = "create --platform linux/amd64 $EXPECTED_IMAGE" ] || exit 92
          [ "$DOCKER_FAIL" != create ] || exit 43
          echo fixture-container ;;
  cp) [ "$2" = fixture-container:/usr/bin/gitleaks ] || exit 91
      [ "$DOCKER_FAIL" != cp ] || exit 44
      if [ "$CORRUPT_IMAGE" = true ]; then printf corrupt > "$3"; else cp "$IMAGE_FIXTURE" "$3"; fi ;;
  rm) [ "$*" = 'rm fixture-container' ] || [ "$*" = 'rm -f fixture-container' ] || exit 90 ;;
  *) exit 89 ;;
esac
`
      );
      executable(
        path.join(bin, 'sleep'),
        '#!/bin/sh\nprintf "%s\\n" "$1" >> "$SLEEP_LOG"\n'
      );
      shaAdapter(bin);
      const result = spawnSync('bash', ['-c', install.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          RUNNER_TEMP: temp,
          GH_TOKEN: 'fixture-auth',
          GITHUB_TOKEN: 'fixture-parent',
          RELEASE_ATTEMPTS: path.join(box, 'release-attempts'),
          SLEEP_LOG: path.join(box, 'sleep-log'),
          GITHUB_OUTPUT: output,
          GITLEAKS_VERSION: pins.GITLEAKS_VERSION,
          GITLEAKS_SHA256: sha(fixture),
          GITLEAKS_IMAGE_DIGEST: pins.GITLEAKS_IMAGE_DIGEST,
          GITLEAKS_IMAGE_BINARY_SHA256: sha(imageFixture),
          EXPECTED_IMAGE: `ghcr.io/gitleaks/gitleaks@sha256:${imageDigest}`,
          RELEASE_LOG: releaseLog,
          DOCKER_LOG: dockerLog,
          VERSION_LOG: versionLog,
          RELEASE_FAILURE: path.join(box, 'release-failed'),
          RELEASE_FAIL: String(Boolean(scenario.downloadFail)),
          CORRUPT_RELEASE: String(Boolean(scenario.corruptRelease)),
          CORRUPT_IMAGE: String(Boolean(scenario.corruptImage)),
          PULL_TIMEOUT: String(Boolean(scenario.timeout)),
          DOCKER_FAIL: scenario.dockerFail ?? '',
          FIXTURE: fixture,
          IMAGE_FIXTURE: imageFixture,
        },
      });
      assert.ifError(result.error);
      assert.equal(
        result.status === 0,
        !scenario.fail,
        result.stdout + result.stderr
      );
      if (scenario.exit) assert.equal(result.status, scenario.exit);
      assert.equal(fs.existsSync(releaseLog), Boolean(scenario.download));
      assert.equal(fs.existsSync(dockerLog), Boolean(scenario.docker));
      assert.equal(
        fs.existsSync(versionLog),
        !scenario.fail || Boolean(scenario.versionRan)
      );
      if (!scenario.fail) {
        assert.equal(
          fs.readFileSync(output, 'utf8'),
          `source=${scenario.source}\n`
        );
        assert.equal(
          fs.readFileSync(path.join(temp, 'gitleaks'), 'utf8'),
          binary(scenario.source)
        );
        assert.match(result.stdout, /: OK/);
      } else {
        assert.equal(
          fs.existsSync(output),
          false,
          'failed supplier cannot publish verified source'
        );
      }
      if (scenario.downloadFail)
        assert.equal(
          fs.existsSync(archive),
          false,
          'partial failed download must not poison the archive cache'
        );
      if (scenario.cleanup)
        assert.match(
          fs.readFileSync(dockerLog, 'utf8'),
          /rm -f fixture-container/
        );
      if (scenario.name.startsWith('corrupt'))
        assert.match(result.stdout + result.stderr, /FAILED|checksum/);
      if (scenario.download) {
        const args = fs.readFileSync(releaseLog, 'utf8').trim().split('\n');
        assert.deepEqual(args.slice(0, 3), ['release', 'download', 'v8.30.1']);
        assert.equal(args[args.indexOf('--repo') + 1], 'gitleaks/gitleaks');
        assert.equal(
          args[args.indexOf('--pattern') + 1],
          'gitleaks_8.30.1_linux_x64.tar.gz'
        );
        assert.equal(args.includes('fixture-auth'), false);
        const attempts = fs
          .readFileSync(path.join(box, 'release-attempts'), 'utf8')
          .trim()
          .split('\n').length;
        assert.equal(
          attempts,
          scenario.downloadFail ? (file === 'security-checks.yaml' ? 4 : 3) : 1
        );
        if (scenario.downloadFail)
          assert.equal(
            fs.readFileSync(path.join(box, 'sleep-log'), 'utf8'),
            file === 'security-checks.yaml' ? '1\n2\n4\n' : '1\n2\n'
          );
      }
    });
  }
}
