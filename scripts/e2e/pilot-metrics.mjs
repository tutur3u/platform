import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const DAY = 86_400_000;
const START = Date.parse('2026-11-27T00:00:00+07:00');
const HOLD_END = Date.parse('2026-12-06T00:00:00+07:00');
const FRAMEWORKS = ['playwright', 'e2e'];
const STATUSES = ['passed', 'failed', 'flaky', 'skipped'];
const SCHEMA = new URL('./pilot-maintenance-log.schema.json', import.meta.url);
const LEDGER = '../../.e2e/pilot-maintenance-log.json';
const sum = (values) => values.reduce((total, value) => total + value, 0);
const list = Array.isArray;
const object = (value) =>
  value !== null && typeof value === 'object' && !list(value);
const name = (value) => typeof value === 'string' && value.trim().length > 0;
const number = (value) => Number.isFinite(value) && value >= 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const nullable = (value, predicate) => value === null || predicate(value);
const isSha = (value) =>
  typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
const dateTime =
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/i;

function timestamp(value, label, allowDate = false) {
  if (allowDate && /^\d{4}-\d\d-\d\d$/.test(value)) value += 'T00:00:00+07:00';
  const time = Date.parse(value);
  if (!dateTime.test(value) || !Number.isFinite(time))
    throw new Error(`Invalid ${label} timestamp`);
  return time;
}

const testId = (...parts) => parts.filter(Boolean).join(' / ');
// oxfmt-ignore
const pwOutcomes = new Map([
  ['expected', 'passed'], ['unexpected', 'failed'],
  ['flaky', 'flaky'], ['skipped', 'skipped'],
]);

export function parsePlaywrightJson(report) {
  const durationMs = report?.stats?.duration;
  if (!list(report?.suites) || !number(durationMs))
    throw new Error('Invalid Playwright JSON report');
  const tests = [];
  function visit(suite, path) {
    for (const { tests: cases, file, title } of suite.specs ?? []) {
      for (const { projectName, status: outcome } of cases) {
        const status = pwOutcomes.get(outcome);
        if (!status) throw new Error(`Unknown Playwright outcome: ${outcome}`);
        tests.push({
          id: testId(file, projectName, ...path, title),
          status,
          modelCalls: 0,
        });
      }
    }
    for (const child of suite.suites ?? [])
      visit(child, [...path, child.title]);
  }
  for (const suite of report.suites) visit(suite, []);
  return {
    tests,
    durationMs,
    modelCalls: 0,
    runErrors: report.errors?.length ?? 0,
  };
}

export function parseE2eJson(report) {
  const run = report?.run;
  const isReport =
    report?.schemaVersion === 'report-1' &&
    [run?.results, run?.serialGroups, run?.errors].every(list);
  if (!isReport || !count(run.usage?.maxModelCallsInStep)) {
    throw new Error('Invalid e2e report-1 JSON');
  }
  const start = timestamp(run.startedAt, 'e2e start');
  const durationMs = timestamp(run.finishedAt, 'e2e finish') - start;
  if (!number(durationMs)) throw new Error('Invalid e2e wall time');
  let modelCalls = 0;
  let maxStepCalls = 0;
  function calls(steps) {
    let total = 0;
    for (const step of steps) {
      const value = step.metrics?.modelCalls ?? 0;
      if (!count(value)) throw new Error('Invalid e2e modelCalls');
      maxStepCalls = Math.max(maxStepCalls, value);
      total += value;
    }
    modelCalls += total;
    return total;
  }
  const serialCalls = new Map();
  for (const group of run.serialGroups) {
    const members = new Map();
    for (const attempt of group.attempts) {
      for (const member of attempt.members) {
        const previous = members.get(member.testId) ?? 0;
        members.set(member.testId, previous + calls(member.steps));
      }
    }
    serialCalls.set(group.id, members);
  }
  const tests = [];
  for (const result of run.results) {
    const direct = sum(result.attempts.map((attempt) => calls(attempt.steps)));
    const serial =
      serialCalls.get(result.serialGroupId)?.get(result.testId) ?? 0;
    if (result.selected === false || result.kind === 'setup') continue;
    const status =
      { interrupted: 'skipped', 'timed-out': 'failed' }[result.status] ??
      result.status;
    if (!STATUSES.includes(status))
      throw new Error(`Unknown e2e outcome: ${result.status}`);
    const agent = result.agent === 'default' ? '' : result.agent;
    const id = testId(result.file, result.targetId, agent, ...result.titlePath);
    tests.push({ id, status, modelCalls: direct + serial });
  }
  if (maxStepCalls !== run.usage.maxModelCallsInStep)
    throw new Error('Inconsistent e2e model-call accounting');
  return { tests, durationMs, modelCalls, runErrors: run.errors.length };
}

const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
function xmlText(text) {
  const entity = /&(?:#(x[\da-f]+|\d+)|(amp|lt|gt|quot|apos));/g;
  return text.replace(entity, (_, code, key) =>
    code
      ? String.fromCodePoint(Number(code.startsWith('x') ? '0' + code : code))
      : entities[key]
  );
}

export function parseJUnit(xml, framework) {
  const tokenize =
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[\w:-]+(?:[^<>'"]|"[^"]*"|'[^']*')*>|[^<]+|</g;
  const attribute = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const failed = new Set(['failure', 'error']);
  const flaky = new Set(['flakyFailure', 'flakyError']);
  const modelCalls = framework === 'e2e' ? null : 0;
  const stack = [];
  const tests = [];
  let root;
  let runErrors = 0;
  const invalid = () => {
    throw new Error('Invalid JUnit document');
  };
  for (const [token] of xml.matchAll(tokenize)) {
    const parent = stack.at(-1);
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    const tag = /^<\/?([\w:-]+)/.exec(token)?.[1];
    if (!tag) {
      if (token === '<' || (!parent && token.trim())) invalid();
      if (parent?.tag === 'system-out')
        parent.text += token.replace(/^<!\[CDATA\[|\]\]>$/g, '');
      continue;
    }
    if (token.startsWith('</')) {
      if (stack.pop()?.tag !== tag) invalid();
      const test = stack.at(-1)?.test;
      const retry = /^flaky: \d+ failed attempts? before passing(?:\n|$)/;
      const output = framework === 'e2e' && tag === 'system-out';
      if (output && test?.status === 'passed' && retry.test(parent.text))
        test.status = 'flaky';
      continue;
    }
    const fields = [...token.matchAll(attribute)];
    const attrs = Object.fromEntries(
      fields.map(([, k, a, b]) => [k, xmlText(a ?? b)])
    );
    const element = { tag, attrs, text: '' };
    if (!parent) {
      if (root || !['testsuite', 'testsuites'].includes(tag)) invalid();
      root = element;
    }
    if (tag === 'testcase') {
      if (parent?.tag !== 'testsuite' || !name(attrs.name)) invalid();
      const { name: file, hostname } = parent.attrs;
      const id = testId(attrs.classname || file, hostname, attrs.name);
      element.test = { id, status: 'passed', modelCalls };
      if (framework === 'e2e' && file === 'run' && attrs.classname === 'run')
        runErrors++;
      else tests.push(element.test);
    }
    if (parent?.test) {
      if (failed.has(tag)) parent.test.status = 'failed';
      if (tag === 'skipped') parent.test.status = 'skipped';
      if (flaky.has(tag) && parent.test.status === 'passed')
        parent.test.status = 'flaky';
    }
    if (!token.endsWith('/>')) stack.push(element);
  }
  if (!root || stack.length) invalid();
  const seconds = Number(root.attrs.time);
  const wall = framework === 'playwright' && root.tag === 'testsuites';
  const durationMs =
    wall && root.attrs.time?.trim() && number(seconds) ? seconds * 1000 : null;
  return { tests, durationMs, modelCalls, runErrors };
}

export function parseMaintenanceLog(text) {
  const ledger = JSON.parse(text);
  const { properties } = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const valid =
    object(ledger) &&
    ledger.$schema === properties.$schema.const &&
    list(ledger.entries) &&
    Object.keys(ledger).length === 2;
  if (!valid) throw new Error('Invalid maintenance log');
  const { properties: fields, required } = properties.entries.items;
  function validField(key, value) {
    if (!Object.hasOwn(fields, key)) return false;
    const rule = fields[key];
    if (rule.enum) return rule.enum.includes(value);
    if (rule.type === 'number') return number(value) && value >= rule.minimum;
    if (!name(value)) return false;
    if (rule.format === 'date-time') timestamp(value, 'maintenance');
    return !rule.pattern || new RegExp(rule.pattern).test(value);
  }
  for (const [index, item] of ledger.entries.entries()) {
    const missing = required.some((key) => !Object.hasOwn(item ?? {}, key));
    const invalid =
      !object(item) ||
      Object.entries(item).some(([key, value]) => !validField(key, value));
    if (missing || invalid)
      throw new Error(`Invalid maintenance log entry ${index}`);
  }
  return ledger.entries;
}

export function parseHistory(text) {
  if (!text.trim()) return [];
  try {
    const history = JSON.parse(text);
    return list(history) ? history : [history];
  } catch {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    return lines.map((line) => JSON.parse(line));
  }
}

function normalizeRun(run) {
  // oxfmt-ignore
  const { suite, runId, framework, commitSha, ci,
    durationMs, modelCalls, runErrors, tests } = run;
  const identity = name(runId) && name(suite) && FRAMEWORKS.includes(framework);
  const measurements =
    nullable(durationMs, number) && nullable(modelCalls, count);
  const context =
    isSha(commitSha) && typeof ci === 'boolean' && count(runErrors);
  if (!identity || !measurements || !context || !list(tests))
    throw new Error('Invalid pilot run snapshot');
  const cases = tests.map(({ id, status, modelCalls: calls }) => {
    if (!name(id) || !STATUSES.includes(status) || !nullable(calls, count))
      throw new Error('Invalid test result');
    return { id, status, modelCalls: calls };
  });
  if (
    modelCalls !== null &&
    sum(cases.map((test) => test.modelCalls ?? 0)) > modelCalls
  ) {
    throw new Error('Test modelCalls exceed run total');
  }
  const started = new Date(timestamp(run.timestamp, 'run')).toISOString();
  // oxfmt-ignore
  return { suite, runId, timestamp: started, framework, commitSha: commitSha.toLowerCase(),
    ci, durationMs, modelCalls, runErrors, tests: cases };
}

export function mergeHistory(...sources) {
  const history = new Map();
  for (const source of sources) {
    for (const input of source) {
      const run = normalizeRun(input);
      const key = JSON.stringify([
        run.runId,
        run.timestamp,
        run.suite,
        run.framework,
      ]);
      const prior = history.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(run))
        throw new Error(`Conflicting pilot snapshots for ${key}`);
      history.set(key, run);
    }
  }
  return [...history.values()];
}

function windowAt({ asOf = new Date().toISOString() } = {}) {
  const end = timestamp(asOf, 'evaluation', true);
  return {
    start: Math.max(START, end - 14 * DAY),
    end,
    elapsedDays: Math.max(0, (end - START) / DAY),
  };
}

const inWindow = (time, { start, end }) => time >= start && time <= end;
const mean = (values) => (values.length ? sum(values) / values.length : null);
const rate = (numerator, denominator) =>
  denominator ? numerator / denominator : null;
const isPass = ({ status }) => status === 'passed' || status === 'flaky';
const isFail = ({ status }) => status === 'failed';
const batchKey = (run) => JSON.stringify([run.runId, run.commitSha]);
const executed = (run) =>
  run.runErrors === 0 && run.tests.some((test) => isPass(test) || isFail(test));
const sorted = (values) => values.toSorted((a, b) => a - b);

function callsIn(values) {
  const known = values.filter(count);
  return {
    sum: sum(known),
    max: known.length ? known.reduce((a, b) => Math.max(a, b)) : null,
    unknown: values.length - known.length,
  };
}

function testMetrics(id, observations) {
  const passed = observations.filter(isPass).length;
  const failed = observations.filter(isFail).length;
  const skipped = observations.length - passed - failed;
  let flaky = observations.filter(({ status }) => status === 'flaky').length;
  const bySha = Map.groupBy(observations, ({ commitSha }) => commitSha);
  for (const sameSha of bySha.values()) {
    if (sameSha.some(isPass)) flaky += sameSha.filter(isFail).length;
  }
  const modelCalls = callsIn(observations.map((test) => test.modelCalls));
  return {
    id,
    passed,
    failed,
    skipped,
    flaky,
    flakeRate: rate(flaky, passed + failed),
    modelCalls,
  };
}

function metrics(runs, breaks, aggregate = false) {
  const records = runs.flatMap(({ tests, suite, framework, commitSha }) =>
    tests.map((test) => ({ ...test, suite, framework, commitSha }))
  );
  const identity = ({ suite, framework, id }) =>
    JSON.stringify([suite, framework, id]);
  const tests = Array.from(
    Map.groupBy(records, identity).values(),
    (observations) => {
      const { id, suite, framework } = observations[0];
      const result = testMetrics(id, observations);
      return aggregate ? { suite, framework, ...result } : result;
    }
  );
  const total = (key) => sum(tests.map((test) => test[key]));
  const [passed, failed, skipped, flaky] = [
    'passed',
    'failed',
    'skipped',
    'flaky',
  ].map(total);
  const ci = runs.filter((run) => run.ci);
  const batches = aggregate
    ? [...Map.groupBy(ci, batchKey).values()]
    : ci.map((run) => [run]);
  const durations = batches.map((batch) => batch.map((run) => run.durationMs));
  const times = sorted(
    durations.filter((batch) => batch.every(number)).map(sum)
  );
  const minutes = sorted(breaks.map((entry) => entry.minutesToFix));
  const middle = Math.floor(minutes.length / 2);
  const median = mean(
    minutes.slice(Math.floor((minutes.length - 1) / 2), middle + 1)
  );
  const uiChange = (entry) =>
    entry.failureCategory === 'ui-change-false-failure';
  const falseFailures = breaks.filter(uiChange).length;
  const p95Ms = times[Math.ceil(times.length * 0.95) - 1] ?? null;
  const ciRuntime = { count: times.length, meanMs: mean(times), p95Ms };
  const calls = callsIn(runs.map((run) => run.modelCalls));
  const maxPerTest = callsIn(records.map((test) => test.modelCalls)).max;
  // oxfmt-ignore
  return {
    runs: runs.length, ciRuns: ci.length,
    passed, failed, skipped, flaky, tests, flakeRate: rate(flaky, passed + failed),
    falseFailures: { count: falseFailures, rate: rate(falseFailures, breaks.length) ?? 0 },
    maintenance: { breaks: breaks.length, meanMinutes: mean(minutes), medianMinutes: median },
    ciRuntime, modelCalls: { ...calls, maxPerTest },
  };
}

const pass = (condition) => (condition ? 'pass' : 'fail');
const sufficient = (condition) => (condition ? 'pass' : 'insufficient-data');

function regressions(baseline, candidate, breaks) {
  const failures = (rows) =>
    new Set(
      rows.filter((r) => r.runErrors || r.tests.some(isFail)).map(batchKey)
    );
  const baselineFailures = failures(baseline);
  const candidateFailures = failures(candidate);
  const entries = breaks.filter((e) => e.runId);
  const labels = Map.groupBy(entries, (e) =>
    batchKey({ ...e, commitSha: e.commitSha.toLowerCase() })
  );
  const unresolved = [...baselineFailures].filter(
    (key) => !labels.get(key)?.some((e) => e.framework === 'playwright')
  );
  const missed = [];
  const real = (e) => e.failureCategory === 'real-regression';
  for (const e of breaks.filter(
    (e) => real(e) && e.framework === 'playwright' && !e.runId
  )) {
    unresolved.push(e.regressionId ?? e.commitSha);
  }
  for (const [key, rows] of labels) {
    const detected = rows.filter((e) => real(e) && e.framework === 'e2e');
    for (const e of rows.filter(
      (e) => real(e) && e.framework === 'playwright'
    )) {
      if (!e.regressionId || !baselineFailures.has(key)) unresolved.push(key);
      else if (
        !candidateFailures.has(key) ||
        !detected.some((r) => r.regressionId === e.regressionId)
      )
        missed.push(e.regressionId);
    }
  }
  return {
    status: missed.length ? 'fail' : sufficient(!unresolved.length),
    missed,
    unresolved,
  };
}

function maintenanceRatio(playwright, e2e) {
  const baseline = playwright.maintenance.meanMinutes;
  return rate(e2e.maintenance.meanMinutes ?? 0, baseline);
}

function evaluate(runs, breaks, window, policy = {}) {
  const {
    minWindowDays = 14,
    minRuns = 10,
    workshopCritical = false,
    runtimeCapMs,
  } = policy;
  const samplePolicy = number(minWindowDays) && count(minRuns) && minRuns > 0;
  const calendarPolicy = typeof workshopCritical === 'boolean';
  const timingPolicy = runtimeCapMs === undefined || number(runtimeCapMs);
  if (!samplePolicy || !calendarPolicy || !timingPolicy)
    throw new Error('Invalid suite retirement options');
  const ci = runs.filter((run) => run.ci);
  const byFramework = Map.groupBy(ci, (run) => run.framework);
  const baseline = byFramework.get('playwright') ?? [];
  const candidate = byFramework.get('e2e') ?? [];
  const breaksFor = (framework) =>
    breaks.filter((entry) => entry.framework === framework);
  const pw = metrics(baseline, breaksFor('playwright'));
  const e2e = metrics(candidate, breaksFor('e2e'));
  const batchKeys = (rows) => new Set(rows.filter(executed).map(batchKey));
  const pairs = batchKeys(baseline).intersection(batchKeys(candidate)).size;
  const ratio = maintenanceRatio(pw, e2e);
  const maintenance = pw.maintenance.breaks
    ? pass(ratio !== null && ratio < 0.5)
    : 'insufficient-break-data';
  const baselineMean = pw.ciRuntime.meanMs;
  const limitMs =
    runtimeCapMs ?? (baselineMean === null ? null : 1.25 * baselineMean);
  const timed =
    baseline.length &&
    candidate.length &&
    pw.ciRuntime.count === baseline.length &&
    e2e.ciRuntime.count === candidate.length;
  const calls = callsIn(ci.map((run) => run.modelCalls));
  const held = workshopCritical && window.end < HOLD_END;
  const criterion = (status, facts) => ({ status, ...facts });
  const comparison = (status, key) =>
    criterion(status, { playwright: pw[key], e2e: e2e[key] });
  // oxfmt-ignore
  const criteria = {
    window: criterion(sufficient(window.elapsedDays >= minWindowDays), { elapsedDays: window.elapsedDays, minWindowDays }),
    sample: criterion(sufficient(pairs >= minRuns), { pairs, minRuns }),
    flakeRate: comparison(pw.flakeRate === null || e2e.flakeRate === null ? 'insufficient-data' : pass(e2e.flakeRate <= pw.flakeRate), 'flakeRate'),
    maintenance: { ...comparison(maintenance, 'maintenance'), ratio },
    falseFailures: comparison(pass(e2e.falseFailures.rate <= pw.falseFailures.rate), 'falseFailures'),
    modelCalls: criterion(calls.sum > 0 ? 'fail' : sufficient(ci.length && !calls.unknown), { ...calls, ciRuns: ci.length }),
    runtime: { ...comparison(timed ? pass(e2e.ciRuntime.meanMs <= limitMs) : 'insufficient-data', 'ciRuntime'), limitMs },
    realRegressions: regressions(baseline, candidate, breaks),
    calendarHold: criterion(pass(!held), { workshopCritical, through: '2026-12-05' }),
  };
  const statuses = Object.values(criteria).map((value) => value.status);
  let status = 'ELIGIBLE_FOR_RETIREMENT_ACK';
  if (held) status = 'HELD_UNTIL_DEC_5';
  else if (statuses.includes('fail')) status = 'KEEP_PLAYWRIGHT';
  else if (statuses.some((value) => value !== 'pass'))
    status = 'INSUFFICIENT_DATA';
  return { status, criteria };
}

function evidence(history, entries, window) {
  const runs = mergeHistory(history).filter((run) =>
    inWindow(Date.parse(run.timestamp), window)
  );
  const breaks = entries.filter((row) =>
    inWindow(timestamp(row.recordedAt, 'maintenance'), window)
  );
  return { runs, breaks };
}

export function evaluateSuiteRetirement(suite, history, entries, options = {}) {
  return summarizePilot(history, entries, {
    ...options,
    suites: { [suite]: options },
  }).suites.find((item) => item.suite === suite).retirement;
}

export function summarizePilot(history, entries, options = {}) {
  const window = windowAt(options);
  const { runs, breaks } = evidence(history, entries, window);
  const runGroups = Map.groupBy(runs, (run) => run.suite);
  const breakGroups = Map.groupBy(breaks, (entry) => entry.suite);
  const policies = options.suites ?? {};
  const seen = [...runGroups.keys(), ...breakGroups.keys()];
  const names = new Set([...seen, ...Object.keys(policies)]);
  function summarize(rows, ledger, aggregate = false) {
    const result = {};
    for (const framework of FRAMEWORKS) {
      const matches = (item) => item.framework === framework;
      const suiteRuns = rows.filter(matches);
      const suiteBreaks = ledger.filter(matches);
      result[framework] = metrics(suiteRuns, suiteBreaks, aggregate);
    }
    result.maintenanceRatio = maintenanceRatio(result.playwright, result.e2e);
    return result;
  }
  const start = new Date(window.start).toISOString();
  const end = new Date(window.end).toISOString();
  const aggregate = summarize(runs, breaks, true);
  aggregate.combined = metrics(runs, breaks, true);
  const suites = [...names].sort().map((suite) => {
    const rows = runGroups.get(suite) ?? [];
    const ledger = breakGroups.get(suite) ?? [];
    const policy = Object.hasOwn(policies, suite) ? policies[suite] : {};
    const retirement = evaluate(rows, ledger, window, {
      ...options,
      ...policy,
    });
    return { suite, ...summarize(rows, ledger), retirement };
  });
  const period = { start, end, elapsedDays: window.elapsedDays };
  return { window: period, aggregate, suites };
}

const html = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const cell = (value) =>
  String(value)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[&<>]/g, (char) => html[char])
    .replace(/[\x5c|`*_[\]~!]/g, '\\$&');
const row = (cells) => `| ${cells.map(cell).join(' | ')} |`;
const metric = (value) => (value === null ? '—' : Number(value.toFixed(2)));
const percent = (value) => (value === null ? '—' : `${metric(value * 100)}%`);

export function renderMarkdown(summary) {
  // oxfmt-ignore
  const columns = ['Suite', 'Framework', 'Runs', 'Pass', 'Fail', 'Skip', 'Flake rate',
    'UI false failures', 'Repair mean / median (min)', 'CI mean / p95 (ms)', 'Calls / max per test', 'Unknown call totals'];
  const window = `Window ${summary.window.start} to ${summary.window.end}`;
  const lines = [
    '# E2E pilot metrics',
    '',
    window,
    '',
    row(columns),
    row(columns.map(() => '---')),
  ];
  const pair = (left, right) => `${metric(left)} / ${metric(right)}`;
  const total = { suite: 'Total', ...summary.aggregate };
  for (const item of [total, ...summary.suites]) {
    const frameworks = item.combined ? [...FRAMEWORKS, 'combined'] : FRAMEWORKS;
    for (const framework of frameworks) {
      const m = item[framework];
      const ui = `${m.falseFailures.count} (${percent(m.falseFailures.rate)})`;
      const maintenance = pair(
        m.maintenance.meanMinutes,
        m.maintenance.medianMinutes
      );
      const runtime = pair(m.ciRuntime.meanMs, m.ciRuntime.p95Ms);
      const calls = pair(m.modelCalls.sum, m.modelCalls.maxPerTest);
      // oxfmt-ignore
      lines.push(row([item.suite, framework, m.runs, m.passed, m.failed, m.skipped,
        percent(m.flakeRate), ui, maintenance, runtime, calls, m.modelCalls.unknown]));
    }
  }
  const ratio = (value) =>
    `Maintenance ratio (e2e / Playwright) **${percent(value)}**`;
  lines.push('', ratio(total.maintenanceRatio));
  for (const { suite, retirement } of summary.suites) {
    const decision = `**${retirement.status}**`;
    const maintenance = ratio(retirement.criteria.maintenance.ratio);
    lines.push('', `## ${cell(suite)}`, '', decision, '', maintenance, '');
    lines.push(row(['Criterion', 'Result']), row(['---', '---']));
    for (const [key, value] of Object.entries(retirement.criteria))
      lines.push(row([key, value.status]));
  }
  return lines.join('\n') + '\n';
}

const read = (path) => readFileSync(path, 'utf8');
function ingest(run, manifest) {
  const reportAt = (path) => read(resolve(dirname(manifest), path));
  const text = reportAt(run.report);
  const document = text.trimStart().startsWith('<') ? null : JSON.parse(text);
  const parse = run.framework === 'e2e' ? parseE2eJson : parsePlaywrightJson;
  const report = document ? parse(document) : parseJUnit(text, run.framework);
  if (run.junit) parseJUnit(reportAt(run.junit), run.framework);
  const ci = document?.run?.environment?.ci === true || run.ci;
  const durationMs = run.durationMs ?? report.durationMs;
  return { ...run, ...report, ci, durationMs };
}

function writeHistory(path, runs) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const text =
      path.endsWith('.ndjson') || path.endsWith('.jsonl')
        ? runs.map((run) => JSON.stringify(run) + '\n').join('')
        : JSON.stringify(runs, null, 2) + '\n';
    writeFileSync(temporary, text, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function main() {
  // oxfmt-ignore
  const paths = [
    'history', 'maintenance-log', 'history-out', 'json-out', 'markdown-out', 'as-of',
  ];
  // oxfmt-ignore
  const { values } = parseArgs({
    options: {
      ...Object.fromEntries(paths.map((key) => [key, { type: 'string' }])),
      manifest: { type: 'string', multiple: true },
      'assert-zero-model-calls': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    const flags = paths.map((key) => `[--${key} VALUE]`).join(' ');
    console.log(
      `Usage: node scripts/e2e/pilot-metrics.mjs [--manifest FILE]... [--assert-zero-model-calls] ${flags}`
    );
    return 0;
  }
  const suites = Object.create(null);
  const reports = (values.manifest ?? []).map((path) => {
    const manifest = JSON.parse(read(path));
    Object.assign(suites, manifest.suites);
    return (manifest.runs ?? []).map((run) => ingest(run, path));
  });
  const history = values.history ? parseHistory(read(values.history)) : [];
  const runs = mergeHistory(history, ...reports);
  const entries = parseMaintenanceLog(
    read(values['maintenance-log'] ?? new URL(LEDGER, import.meta.url))
  );
  const options = { asOf: values['as-of'], suites };
  const summary = summarizePilot(runs, entries, options);
  const output = values['history-out'];
  const window = windowAt(options);
  const current = runs.filter((run) =>
    inWindow(Date.parse(run.timestamp), window)
  );
  if (output) writeHistory(output, current);
  if (values['json-out'])
    writeFileSync(values['json-out'], JSON.stringify(summary, null, 2) + '\n');
  const markdown = renderMarkdown(summary);
  if (values['markdown-out']) writeFileSync(values['markdown-out'], markdown);
  else process.stdout.write(markdown);
  const violatesCi = (run) => run.ci && run.modelCalls !== 0;
  if (values['assert-zero-model-calls'] && runs.some(violatesCi)) {
    console.error(
      'CI modelCalls must equal zero. At least one CI run reported a positive or unknown total.'
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
