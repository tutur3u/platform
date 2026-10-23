const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const repoRoot = path.resolve(__dirname, '../..');
const roots = ['.github/workflows', '.github/actions'];

// Expressions are substituted into the script text before the shell parses
// it, so event payloads and caller inputs must reach scripts through env.
const untrusted = /^(?:github\.event\.|github\.head_ref\b|inputs\.)/u;

// Owned by the Bun runtime pin integration; callers pass literal versions.
const deferred = new Set([
  '.github/actions/setup-bun-with-retry/action.yml: inputs.bun-version',
]);

function yamlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/u.test(entry.name) ? [full] : [];
  });
}

function parseYamlFiles(files) {
  return JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        `const out = {};
for (const file of process.argv.slice(1)) out[file] = Bun.YAML.parse(await Bun.file(file).text());
console.log(JSON.stringify(out));`,
        ...files,
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    )
  );
}

function stepsOf(document) {
  if (document?.runs?.steps) return document.runs.steps;
  return Object.values(document?.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function scriptsOf(step) {
  const scripts = [];
  if (typeof step.run === 'string') scripts.push(step.run);
  if (
    step.uses?.startsWith('actions/github-script@') &&
    typeof step.with?.script === 'string'
  ) {
    scripts.push(step.with.script);
  }
  return scripts;
}

function untrustedInterpolations(script) {
  return [...script.matchAll(/\$\{\{\s*([\s\S]*?)\s*\}\}/gu)]
    .map((match) => match[1])
    .filter((expression) =>
      expression
        .split(/\|\||&&|[()!,]/u)
        .some((operand) => untrusted.test(operand.trim()))
    );
}

test('run scripts never interpolate event payloads or inputs', () => {
  const files = roots.flatMap((root) => yamlFiles(path.join(repoRoot, root)));
  assert.ok(files.length > 100);
  const documents = parseYamlFiles(files);
  const failures = Object.entries(documents).flatMap(([file, document]) =>
    stepsOf(document)
      .flatMap(scriptsOf)
      .flatMap(untrustedInterpolations)
      .map((expression) => `${path.relative(repoRoot, file)}: ${expression}`)
      .filter((entry) => !deferred.has(entry))
  );
  assert.deepEqual(failures, []);
});

const expression = (body) => `\${{ ${body} }}`;

test('interpolation check rejects injection-shaped scripts', () => {
  for (const script of [
    `echo "${expression('github.event.pull_request.title')}"`,
    `echo ${expression('github.head_ref')}`,
    `echo "${expression('inputs.preview_ref')}"`,
    `echo "${expression('github.event.inputs.preview_ref || github.sha')}"`,
    `git diff ${expression('github.event.before')} HEAD`,
  ]) {
    assert.equal(untrustedInterpolations(script).length, 1, script);
  }
  for (const script of [
    'echo "$PREVIEW_REF"',
    `echo "${expression('github.sha')}"`,
    `if [ "${expression('github.event_name')}" = push ]; then :; fi`,
    `echo "${expression('steps.check.outputs.should_run')}"`,
  ]) {
    assert.deepEqual(untrustedInterpolations(script), [], script);
  }
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function readOutputs(file) {
  const outputs = {};
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const heredoc = /^([\w-]+)<<(\w+)$/u.exec(lines[index]);
    if (!heredoc) continue;
    const end = lines.indexOf(heredoc[2], index + 1);
    outputs[heredoc[1]] = lines.slice(index + 1, end).join('\n');
    index = end;
  }
  return outputs;
}

test('migration checks treat PR file names as data', (t) => {
  const workflow = parseYamlFiles([
    path.join(repoRoot, '.github/workflows/check-migrations.yml'),
  ]);
  const steps = Object.values(workflow)[0].jobs['check-migrations'].steps;
  const collect = steps.find((step) => step.id === 'new_migrations');
  const check = steps.find((step) => step.name === 'Check new migration files');
  for (const step of [collect, check]) {
    assert.deepEqual(untrustedInterpolations(step.run), []);
    assert.doesNotMatch(step.run, /\$\{\{/u);
  }
  assert.equal(
    check.env.NEW_MIGRATIONS,
    expression('steps.new_migrations.outputs.new_files')
  );

  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'check-migrations-'));
  t.after(() => fs.rmSync(repo, { force: true, recursive: true }));
  const migrations = path.join(repo, 'apps/database/supabase/migrations');
  fs.mkdirSync(migrations, { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'ci@example.com');
  git(repo, 'config', 'user.name', 'CI');
  fs.writeFileSync(path.join(migrations, '20260101000000_base.sql'), '');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(migrations, '20990101000000_$(id>PWNED).sql'), '');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'head');
  const head = git(repo, 'rev-parse', 'HEAD');

  const outputFile = path.join(repo, '.github-output');
  fs.writeFileSync(outputFile, '');
  const env = { ...process.env, GITHUB_OUTPUT: outputFile };
  const run = (script, extra) =>
    spawnSync('bash', ['-e', '-c', script], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...env, ...extra },
    });

  const collected = run(collect.run, { BASE_SHA: base, HEAD_SHA: head });
  assert.equal(collected.status, 0, collected.stderr);
  const newFiles = readOutputs(outputFile).new_files;
  assert.match(newFiles, /\$\(id>PWNED\)\.sql$/u);

  const checked = run(check.run, { BASE_SHA: base, NEW_MIGRATIONS: newFiles });
  assert.equal(checked.status, 0, checked.stderr + checked.stdout);
  assert.equal(fs.existsSync(path.join(repo, 'PWNED')), false);
});
