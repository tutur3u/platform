const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  readAllWorkflows,
  workflowsDir,
} = require('./workflow-yaml-test-helper');
const {
  EXCEPTIONS,
  VERCEL_NODE,
  checkWorkflows,
  disabledWorkflows,
  fileSource,
  readPin,
  rewriteWorkflow,
} = require('./node-version-pin');

const root = path.resolve(__dirname, '../..');
const pin = readPin();
const checkout = (options = {}, extra = {}) => ({
  uses: 'actions/checkout@v7',
  with: options,
  ...extra,
});
const setup = (
  inputs = { 'node-version-file': '.node-version' },
  extra = {}
) => ({
  uses: 'actions/setup-node@v7',
  with: inputs,
  ...extra,
});
const workflow = (steps, on) => ({ on, jobs: { validate: { steps } } });
// Include both real exception identities so stale-entry checking stays enabled.
const exceptions = Object.fromEntries(
  [...EXCEPTIONS].map(([id, version]) => {
    const [file, job] = id.split(':');
    return [
      file,
      { jobs: { [job]: { steps: [setup({ 'node-version': version })] } } },
    ];
  })
);
const check = (workflows) =>
  checkWorkflows({ ...exceptions, ...workflows }, { pin });

test('.node-version is one exact release', () => {
  assert.match(pin, /^\d+\.\d+\.\d+$/u);
  assert.equal(
    fs.readFileSync(path.join(root, '.node-version'), 'utf8'),
    `${pin}\n`
  );
});

test('every setup-node step and validation filter follows the pin policy', () => {
  const workflows = readAllWorkflows();
  assert.ok(Object.keys(workflows).length > 0);
  assert.deepEqual(
    checkWorkflows(workflows, { pin, disabled: disabledWorkflows() }),
    []
  );
});

test('runtime assertions in workflows name the repository pin', () => {
  for (const file of fs.readdirSync(workflowsDir)) {
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const [, version] of text.matchAll(
      /test "\$\(node --version\)" = (v[\d.]+)/gu
    ))
      assert.equal(version, `v${pin}`, file);
  }
});

for (const [name, options, extra] of [
  ['foreign repository', { repository: 'other/project' }],
  ['input repository', { repository: `\${{ inputs.repository }}` }],
  ['older ref', { ref: 'production' }],
  ['sparse checkout', { 'sparse-checkout': '.' }],
  ['conditional checkout', {}, { if: 'false' }],
  ['allowed checkout failure', {}, { 'continue-on-error': true }],
  ['path outside the workspace', { path: '../other' }],
]) {
  test(`a ${name} cannot supply the version file`, () => {
    const steps = [checkout(options, extra), setup()];
    assert.equal(fileSource(steps, 1), undefined);
    assert.match(
      check({ 'test.yaml': workflow(steps) }).join('\n'),
      /expected node-version 26/
    );
    assert.deepEqual(
      check({
        'test.yaml': workflow([steps[0], setup({ 'node-version': pin })]),
      }),
      []
    );
  });
}

test('only the latest checkout of the selected path supplies the file', () => {
  const steps = [
    checkout(),
    checkout({ repository: 'other/project' }),
    setup(),
  ];
  assert.equal(fileSource(steps, 2), undefined);
});

test('same-repository same-SHA checkout with the same condition supplies the file', () => {
  const steps = [
    checkout(
      {
        repository: `\${{ github.repository }}`,
        ref: `\${{ github.sha }}`,
        path: './src/',
      },
      { if: 'success()' }
    ),
    setup({ 'node-version-file': 'src/.node-version' }, { if: 'success()' }),
  ];
  assert.equal(fileSource(steps, 1), 'src/.node-version');
  assert.deepEqual(check({ 'test.yaml': workflow(steps) }), []);
});

for (const command of [
  'echo "vercel build"',
  '# vercel deploy',
  'printf "vercel pull"',
  'echo vercel build',
]) {
  test(`quoted or commented Vercel text is not an exception: ${command}`, () => {
    const steps = [
      checkout(),
      setup({ 'node-version': VERCEL_NODE }),
      { run: command },
    ];
    assert.match(
      check({ 'vercel-preview-test.yaml': workflow(steps) }).join('\n'),
      /expected node-version-file/
    );
  });
}

test('Vercel commands grant the exception only to their own job and workflow', () => {
  const steps = [
    checkout(),
    setup({ 'node-version': VERCEL_NODE }),
    { run: 'vercel build --prod' },
  ];
  assert.deepEqual(
    check({ 'vercel-production-test.yaml': workflow(steps) }),
    []
  );
  assert.match(
    check({ 'unit.yaml': workflow(steps) }).join('\n'),
    /expected node-version-file/
  );
  const mixed = workflow(steps);
  mixed.jobs.policy = {
    steps: [checkout(), setup({ 'node-version': VERCEL_NODE })],
  };
  assert.match(
    check({ 'vercel-production-test.yaml': mixed }).join('\n'),
    /:policy: expected node-version-file/
  );
});

test('only the known local command wrapper counts as a Vercel invocation', () => {
  const wrapped = {
    uses: './.github/actions/run-with-turbo-remote-cache',
    with: { command: 'vercel build --prod' },
  };
  const steps = [checkout(), setup({ 'node-version': VERCEL_NODE }), wrapped];
  assert.deepEqual(
    check({ 'vercel-production-test.yaml': workflow(steps) }),
    []
  );
  wrapped.uses = 'unrelated/action@v1';
  assert.match(
    check({ 'vercel-production-test.yaml': workflow(steps) }).join('\n'),
    /expected node-version-file/
  );
});

test('the guard rejects floating and overridden Node inputs', () => {
  for (const inputs of [
    { 'node-version': 26 },
    { 'node-version-file': '.node-version', 'node-version': 24 },
  ])
    assert.ok(
      check({ 'test.yaml': workflow([checkout(), setup(inputs)]) }).length
    );
});

test('pin consumers propagate through reusable workflows, excluding the CI gate', () => {
  const caller = (callee) => ({
    on: { pull_request: { paths: ['apps/**'] } },
    jobs: { call: { uses: `./.github/workflows/${callee}` } },
  });
  const errors = check({
    'leaf.yaml': workflow([checkout(), setup()]),
    'middle.yaml': caller('leaf.yaml'),
    'top.yaml': caller('middle.yaml'),
    'gate-only.yaml': caller('ci-check.yml'),
    'ci-check.yml': workflow([checkout(), setup()]),
  });
  assert.deepEqual(errors, [
    'middle.yaml: pull_request filters must admit .node-version',
    'top.yaml: pull_request filters must admit .node-version',
  ]);
});

for (const filter of [
  { paths: ['**'] },
  { paths: ['**/*'] },
  { paths: ['apps/**', '.node-version'] },
  { 'paths-ignore': ['apps/docs/**'] },
]) {
  test(`GitHub dotfile semantics admit the pin: ${JSON.stringify(filter)}`, () => {
    assert.deepEqual(
      check({
        'test.yaml': workflow([checkout(), setup()], { pull_request: filter }),
      }),
      []
    );
  });
}

for (const filter of [
  { paths: ['apps/**'] },
  { paths: ['**', '!.node-version'] },
  { 'paths-ignore': ['.node-version'] },
]) {
  test(`filters that exclude the pin fail: ${JSON.stringify(filter)}`, () => {
    assert.match(
      check({
        'test.yaml': workflow([checkout(), setup()], { pull_request: filter }),
      }).join('\n'),
      /filters must admit/
    );
  });
}

test('production-only publish filters stay scoped', () => {
  assert.deepEqual(
    check({
      'test.yaml': workflow([checkout(), setup()], {
        push: { branches: ['production'], paths: ['apps/**'] },
      }),
    }),
    []
  );
});

for (const paths of [
  "    paths: ['apps/**']",
  "    paths:\n      [\n        'apps/**',\n      ]",
  "    paths:\n      - 'apps/**'",
]) {
  test(`the transform handles ${paths.includes('[') ? 'inline' : 'block'} filters and is idempotent`, () => {
    const text = `on:\n  pull_request:\n${paths}\njobs:\n  validate:\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 24\n`;
    const parse = (value) =>
      JSON.parse(
        require('node:child_process').execFileSync(
          'bun',
          [
            '-e',
            'console.log(JSON.stringify(Bun.YAML.parse(process.argv[1])))',
            value,
          ],
          { encoding: 'utf8' }
        )
      );
    const next = rewriteWorkflow(text, 'test.yaml', parse(text), {
      pin,
      consumer: true,
    });
    assert.deepEqual(check({ 'test.yaml': parse(next) }), []);
    assert.equal(
      rewriteWorkflow(next, 'test.yaml', parse(next), { pin, consumer: true }),
      next
    );
  });
}
