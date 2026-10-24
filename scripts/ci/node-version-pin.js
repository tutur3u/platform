#!/usr/bin/env node
// Node release policy for GitHub workflows. `.node-version` is the single
// source; this module plans every actions/setup-node step, checks workflows
// against the plan, and rewrites them (`--write`) when the pin or main moves.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const PIN_FILE = '.node-version';
const SAME_COMMIT_REF = `\${{ github.sha }}`;
const SAME_REPOSITORY = `\${{ github.repository }}`;
// Vercel Functions run Node 24.x/22.x only; Vercel workflows build where the
// function runs, on the latest patched 24 rather than a cached floating 24.
const VERCEL_NODE = '24.22.1';
const VERCEL_WORKFLOW = /^vercel-(preview|production)(-[a-z0-9-]+)?\.ya?ml$/u;
const VERCEL_INVOCATION =
  /^(?:[A-Za-z_]\w*=\$\()?(?:bunx\s+|npx\s+)?vercel\s+(?:pull|build|deploy)\b/mu;
// Recorded exceptions; each must still exist and keep this exact value.
const EXCEPTIONS = new Map([
  // Qualifies an input source SHA whose chat check binds a Node 24 identity.
  ['employee-schema-contract.yaml:schema', '24.22.1'],
  // supabase-production.yaml admits only allowlisted blob SHAs of this file.
  ['supabase-staging.yaml:migrate', 24],
]);
// The CI gate every workflow calls; it does not make callers pin consumers.
const GATE_WORKFLOWS = new Set(['ci-check.yml']);
const FILTERED_EVENTS = ['pull_request', 'pull_request_target', 'push'];

// Validation events whose filters must admit the pin. Pushes limited to the
// production branch publish releases; their validation ran on main and PRs.
function validationEvents(on) {
  if (!on || typeof on !== 'object' || Array.isArray(on)) return [];
  return FILTERED_EVENTS.filter((event) => {
    if (!on[event]) return false;
    const branches = on[event].branches;
    return !(
      event === 'push' &&
      Array.isArray(branches) &&
      branches.length > 0 &&
      branches.every((branch) => branch === 'production')
    );
  });
}

const readPin = (dir = root) =>
  fs.readFileSync(path.join(dir, PIN_FILE), 'utf8').trim();

function disabledWorkflows(dir = root) {
  const config = fs.readFileSync(path.join(dir, 'tuturuuu.ci.ts'), 'utf8');
  return new Set([
    ...[...config.matchAll(/'([\w.-]+\.ya?ml)': false/gu)].map(
      ([, file]) => file
    ),
    // The retained preview workflow also belongs to the paused TanStack app.
    'vercel-preview-tanstack-web.yaml',
  ]);
}

function stepCommands(step) {
  const commands = [];
  if (typeof step.run === 'string') commands.push(step.run);
  if (
    step.uses === './.github/actions/run-with-turbo-remote-cache' &&
    typeof step.with?.command === 'string'
  )
    commands.push(step.with.command);
  return commands.map((text) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
  );
}

const invokesVercel = (job) =>
  (job.steps ?? []).some((step) =>
    stepCommands(step).some((text) => VERCEL_INVOCATION.test(text))
  );

const normalizePath = (value) =>
  String(value ?? '')
    .replace(/^\.$|^\.\//u, '')
    .replace(/\/$/u, '');

// The checkout that may supply `.node-version`: the last checkout of the
// workspace root (or of the only checked-out path) before the setup step.
// It must be this repository at the workflow's own commit, complete, and
// run under the same condition as the setup step.
function fileSource(steps, index) {
  const latest = new Map();
  for (const step of steps.slice(0, index))
    if (step.uses?.startsWith('actions/checkout@'))
      latest.set(normalizePath(step.with?.path), step);
  const prefix = latest.has('')
    ? ''
    : latest.size === 1
      ? [...latest.keys()][0]
      : undefined;
  if (prefix === undefined) return undefined;
  if (prefix && !/^[\w-]+(?:\/[\w-]+)*$/u.test(prefix)) return;
  const checkout = latest.get(prefix);
  const options = checkout.with ?? {};
  const repository = options.repository;
  if (repository !== undefined && repository !== SAME_REPOSITORY) return;
  if (options.ref !== undefined && options.ref !== SAME_COMMIT_REF) return;
  if (options['sparse-checkout'] !== undefined) return;
  if (checkout['continue-on-error'] !== undefined) return;
  if (checkout.if !== undefined && checkout.if !== steps[index].if) return;
  return prefix ? `${prefix}/${PIN_FILE}` : PIN_FILE;
}

// Desired setup-node input for one step: { file } or { version }.
function planStep({ file, jobName, steps, index, pin, vercel }) {
  const id = `${file}:${jobName}`;
  if (EXCEPTIONS.has(id)) return { id, version: EXCEPTIONS.get(id) };
  if (vercel) return { id, version: VERCEL_NODE };
  const source = fileSource(steps, index);
  return source ? { id, file: source } : { id, version: pin };
}

function planWorkflow(file, workflow, pin) {
  // Both the Vercel workflow name and a real CLI invocation are required.
  const steps = [];
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    const vercel = VERCEL_WORKFLOW.test(file) && invokesVercel(job);
    (job.steps ?? []).forEach((step, index) => {
      if (step.uses?.startsWith('actions/setup-node@'))
        steps.push({
          ...planStep({ file, jobName, steps: job.steps, index, pin, vercel }),
          step,
        });
    });
  }
  return { steps };
}

const resolvesPin = (planned) =>
  planned.file !== undefined || String(planned.version) === planned.pin;

// Workflows whose runtime moves with the pin, including through local
// reusable workflows other than the CI gate.
function pinConsumers(workflows, plans, pin) {
  const direct = new Set(
    Object.entries(plans)
      .filter(([, plan]) =>
        plan.steps.some((planned) => resolvesPin({ ...planned, pin }))
      )
      .map(([file]) => file)
  );
  const calls = (file) =>
    Object.values(workflows[file]?.jobs ?? {})
      .map((job) => job.uses?.match(/^\.\/\.github\/workflows\/(.+)$/u)?.[1])
      .filter((callee) => callee && !GATE_WORKFLOWS.has(callee));
  const consumers = new Set(direct);
  let grew = true;
  while (grew) {
    grew = false;
    for (const file of Object.keys(plans))
      if (!consumers.has(file) && calls(file).some((c) => consumers.has(c))) {
        consumers.add(file);
        grew = true;
      }
  }
  return consumers;
}

// GitHub path filters: `**` spans directories and both wildcards match dots.
function matchesFilter(file, pattern) {
  const source = pattern
    .split(/(\*\*\/?|\*|\?)/u)
    .map((part) =>
      part === '**/'
        ? '(?:.*/)?'
        : part === '**'
          ? '.*'
          : part === '*'
            ? '[^/]*'
            : part === '?'
              ? '[^/]'
              : part.replace(/[.+^${}()|[\]\\]/gu, '\\$&')
    )
    .join('');
  return new RegExp(`^${source}$`, 'u').test(file);
}

function admitsPin(filter) {
  let admitted = false;
  for (const pattern of filter.paths ?? []) {
    const negated = pattern.startsWith('!');
    if (matchesFilter(PIN_FILE, negated ? pattern.slice(1) : pattern))
      admitted = !negated;
  }
  const ignored = (filter['paths-ignore'] ?? []).some((pattern) =>
    matchesFilter(PIN_FILE, pattern)
  );
  return filter.paths === undefined ? !ignored : admitted && !ignored;
}

function checkWorkflows(workflows, { pin, disabled = new Set() }) {
  const violations = [];
  const plans = {};
  for (const [file, workflow] of Object.entries(workflows))
    if (!disabled.has(file)) plans[file] = planWorkflow(file, workflow, pin);
  const seen = new Set();
  for (const plan of Object.values(plans)) {
    for (const { id, step, file: source, version } of plan.steps) {
      seen.add(id);
      const actual = step.with ?? {};
      if (source !== undefined) {
        if (
          actual['node-version-file'] !== source ||
          actual['node-version'] !== undefined
        )
          violations.push(`${id}: expected node-version-file ${source}`);
      } else if (
        String(actual['node-version']) !== String(version) ||
        actual['node-version-file'] !== undefined
      )
        violations.push(`${id}: expected node-version ${version}`);
    }
  }
  for (const id of EXCEPTIONS.keys())
    if (!seen.has(id)) violations.push(`${id}: stale exception`);
  for (const file of pinConsumers(workflows, plans, pin)) {
    const on = workflows[file].on;
    for (const event of validationEvents(on))
      if (!admitsPin(on[event]))
        violations.push(`${file}: ${event} filters must admit ${PIN_FILE}`);
  }
  return violations;
}

// Rewrites setup-node inputs and on.<event>.paths filters to match the plan.
function rewriteWorkflow(text, file, workflow, { pin, consumer }) {
  const plan = planWorkflow(file, workflow, pin).steps;
  const lines = text.split('\n');
  let next = 0;
  for (let i = 0; i < lines.length; i++) {
    const uses = lines[i].match(/^(\s*)(?:-\s+)?uses:\s*actions\/setup-node@/u);
    if (!uses) continue;
    const planned = plan[next++];
    const changes =
      planned.file !== undefined || resolvesPin({ ...planned, pin });
    for (let b = i; b >= Math.max(0, i - 3) && changes; b--)
      lines[b] = lines[b].replace(/^(\s*-?\s*name: Use Node\.js) 24$/u, '$1');
    const stepIndent = uses[1].length;
    for (let t = i + 1; t < lines.length; t++) {
      const indent = lines[t].match(/^\s*/u)[0].length;
      const trimmed = lines[t].trim();
      if (
        trimmed &&
        (indent < stepIndent ||
          (indent === stepIndent && trimmed.startsWith('-')))
      )
        break;
      const input = lines[t].match(/^(\s*)node-version(?:-file)?:\s*\S.*$/u);
      if (!input) continue;
      lines[t] =
        planned.file !== undefined
          ? `${input[1]}node-version-file: ${planned.file}`
          : `${input[1]}node-version: ${planned.version}`;
      break;
    }
  }
  if (next !== plan.length) throw new Error(`${file}: setup-node steps moved`);
  return (
    consumer ? addPinFilters(lines, validationEvents(workflow.on)) : lines
  )
    .join('\n')
    .replace(
      /test "\$\(node --version\)" = v[\d.]+/gu,
      `test "$(node --version)" = v${pin}`
    );
}

function addPinFilters(lines, events) {
  const start = lines.findIndex((line) => /^["']?on["']?:/u.test(line));
  if (start < 0) return lines;
  let end = start + 1;
  while (end < lines.length && !/^\S/u.test(lines[end])) end++;
  const out = [...lines];
  const eventOf = (i) => {
    for (let j = i; j > start; j--) {
      const key = out[j].match(/^ {2}["']?([\w-]+)["']?:/u);
      if (key) return key[1];
    }
  };
  for (let i = end - 1; i > start; i--) {
    if (!/^\s+paths:/u.test(out[i]) || !events.includes(eventOf(i))) continue;
    const inline = out[i].match(/^(\s+paths:\s*\[)(\s*(['"]?).*)$/u);
    if (inline && !/['"]?\.node-version['"]?/u.test(out[i])) {
      const q = inline[3] || "'";
      out[i] = `${inline[1]}${q}${PIN_FILE}${q}, ${inline[2].trimStart()}`;
      continue;
    }
    const block = out[i].match(/^(\s+)paths:\s*$/u);
    if (!block) continue;
    if (out[i + 1]?.trim() === '[') {
      let j = i + 2;
      while (j < end && !/^\s*\],?\s*$/u.test(out[j])) j++;
      if (!out.slice(i + 2, j).some((line) => line.includes(PIN_FILE)))
        out.splice(i + 2, 0, `${block[1]}    '${PIN_FILE}',`);
      continue;
    }
    let last = i;
    let quote = "'";
    let itemIndent = `${block[1]}  `;
    for (let j = i + 1; j < end; j++) {
      const item = out[j].match(/^(\s+)-\s+(['"]?)(.*?)\2\s*$/u);
      if (!item || item[1].length <= block[1].length) break;
      if (item[3] === PIN_FILE) {
        last = -1;
        break;
      }
      [last, itemIndent, quote] = [j, item[1], item[2]];
    }
    if (last >= 0)
      out.splice(last + 1, 0, `${itemIndent}- ${quote}${PIN_FILE}${quote}`);
  }
  return out;
}

function writeRepository(dir = root) {
  const {
    readAllWorkflows,
    workflowsDir,
  } = require('./workflow-yaml-test-helper');
  const workflows = readAllWorkflows();
  const pin = readPin(dir);
  const disabled = disabledWorkflows(dir);
  const plans = {};
  for (const [file, workflow] of Object.entries(workflows))
    if (!disabled.has(file)) plans[file] = planWorkflow(file, workflow, pin);
  const consumers = pinConsumers(workflows, plans, pin);
  for (const file of Object.keys(plans)) {
    const target = path.join(workflowsDir, file);
    const text = fs.readFileSync(target, 'utf8');
    const next = rewriteWorkflow(text, file, workflows[file], {
      pin,
      consumer: consumers.has(file),
    });
    if (next !== text) fs.writeFileSync(target, next);
  }
  return checkWorkflows(readAllWorkflows(), { pin, disabled });
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  const violations = write
    ? writeRepository()
    : checkWorkflows(
        require('./workflow-yaml-test-helper').readAllWorkflows(),
        { pin: readPin(), disabled: disabledWorkflows() }
      );
  for (const violation of violations) console.error(violation);
  process.exitCode = violations.length ? 1 : 0;
}

module.exports = {
  matchesFilter,
  EXCEPTIONS,
  VERCEL_NODE,
  checkWorkflows,
  disabledWorkflows,
  fileSource,
  readPin,
  rewriteWorkflow,
};
