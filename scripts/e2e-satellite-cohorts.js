const fs = require('node:fs');
const { GRAPH_PREFIX } = require('./e2e-config-reporter');
const path = require('node:path');
const { getRequiredOwnedSatellites } = require('./e2e-owned-satellites');
const { shouldStartTasksSatellite } = require('./e2e-tasks-satellite');

function parseDiscoveryOutput(output) {
  const lines = output.split(/\r?\n/);
  const graphs = lines.filter((line) => line.startsWith(GRAPH_PREFIX));
  if (graphs.length !== 1) return output;
  const graph = JSON.parse(graphs[0].slice(GRAPH_PREFIX.length));
  const report = JSON.parse(
    lines.filter((line) => !line.startsWith(GRAPH_PREFIX)).join('\n')
  );
  report.dependencyGraph = graph;
  return JSON.stringify(report);
}

function dependencyComponents(graph) {
  if (!graph || !Array.isArray(graph.projects)) return null;
  const projects = new Map(graph.projects.map((p) => [p.name, p]));
  if (projects.size !== graph.projects.length) return null;
  const edges = new Map([...projects.keys()].map((name) => [name, new Set()]));
  for (const project of projects.values()) {
    // Teardown order has additional semantics: retain the original invocation.
    if (!Array.isArray(project.dependencies) || project.teardown) return null;
    for (const dependency of project.dependencies) {
      if (!projects.has(dependency)) return null;
      edges.get(project.name).add(dependency);
      edges.get(dependency).add(project.name);
    }
  }
  const components = new Map();
  const visit = (name, names) => {
    if (names.has(name)) return;
    names.add(name);
    for (const next of edges.get(name)) visit(next, names);
  };
  for (const name of projects.keys()) {
    if (components.has(name) || !edges.get(name).size) continue;
    const names = new Set();
    visit(name, names);
    for (const member of names)
      components.set(member, [...names].sort().join(','));
  }
  return components;
}

function reportRows(report) {
  const rows = [];
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const entry of spec.tests ?? []) {
        const project = entry.projectName ? `[${entry.projectName}] › ` : '';
        rows.push(
          `${project}${spec.file}:${spec.line}:${spec.column} › ${[...titles, spec.title].join(' › ')}`
        );
      }
    }
    for (const child of suite.suites ?? [])
      visit(child, [...titles, child.title]);
  };
  for (const suite of report.suites) {
    visit(suite, []);
  }
  return rows;
}

function planSatelliteCohorts(list, env = {}) {
  let rows;
  let graph;
  if (list.trimStart().startsWith('{')) {
    const report = JSON.parse(list);
    if (report.errors?.length || !Array.isArray(report.suites)) {
      throw new Error('Unreadable selected E2E manifest');
    }
    graph = report.dependencyGraph;
    rows = reportRows(report);
  } else {
    rows = list
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^(?:\[[^\]]+\] › )?.+:[0-9]+:[0-9]+ › /.test(line));
  }
  if (!rows.length) throw new Error('Unreadable selected E2E manifest');
  const components = dependencyComponents(graph);
  const groups = new Map();
  for (const row of rows) {
    const file = row
      .replace(/^\[[^\]]+\] › /, '')
      .split(/:[0-9]+:[0-9]+ › /)[0];
    const satellites = getRequiredOwnedSatellites([file], env);
    const tasks = shouldStartTasksSatellite([file], env);
    const project = row.match(/^\[([^\]]+)\] › /)?.[1];
    const dependencyKey = components?.get(project);
    const serviceKey = [
      ...satellites.map((s) => s.appName),
      ...(tasks ? ['tasks'] : []),
    ]
      .sort()
      .join(',');
    const key = dependencyKey ? `dependency:${dependencyKey}` : serviceKey;
    if (!groups.has(key))
      groups.set(key, {
        satellites: [],
        tasks: false,
        rows: [],
        dependencies: Boolean(dependencyKey),
      });
    const group = groups.get(key);
    group.rows.push(row);
    group.tasks ||= tasks;
    for (const satellite of satellites)
      if (!group.satellites.some((item) => item.appName === satellite.appName))
        group.satellites.push(satellite);
  }
  // Dependency-connected projects share an invocation; Playwright owns failure skips.
  const cohorts = [...groups.entries()]
    .sort(([a], [b]) => (!a ? -1 : !b ? 1 : 0))
    .map(([, group]) => group);
  if (cohorts.flatMap((group) => group.rows).length !== rows.length) {
    throw new Error('Incomplete selected E2E manifest');
  }
  return cohorts;
}

function cohortArgs(args, manifest, output, dependencies = false) {
  // Selection already happened once, including shard and project dependencies.
  // Reapplying grep/project/file filters would omit those dependency tests.
  const selectors = new Set([
    '--shard',
    '--test-list',
    '--test-list-invert',
    '--output',
    '--grep',
    '-g',
    '--grep-invert',
    '-G',
    '--project',
    '--only-changed',
  ]);
  const values = new Set([
    '--config',
    '-c',
    '--reporter',
    '--add-reporter',
    '--retries',
    '--repeat-each',
    '--workers',
    '-j',
    '--timeout',
    '--global-timeout',
    '--max-failures',
    '--trace',
    '--tsconfig',
    '--last-failed-file',
    '--update-source-method',
    '--update-snapshots',
    '--run-agents',
    '--agents-init',
  ]);
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i].split('=')[0];
    if (selectors.has(flag)) {
      if (!args[i].includes('=')) {
        if (flag === '--project')
          while (args[i + 1] && !args[i + 1].startsWith('-')) i++;
        else if (args[i + 1] && !args[i + 1].startsWith('-')) i++;
      }
      continue;
    }
    if (flag === '--last-failed' || flag === '--no-deps') continue;
    if (!args[i].startsWith('-')) continue;
    result.push(args[i]);
    if (
      values.has(flag) &&
      !args[i].includes('=') &&
      args[i + 1] &&
      !args[i + 1].startsWith('-')
    )
      result.push(args[++i]);
  }
  return [
    ...result,
    ...(dependencies ? [] : ['--no-deps']),
    '--test-list',
    manifest,
    '--output',
    output,
  ];
}

// Finite stop policies apply to the whole Playwright invocation. Retain that
// invocation when splitting would reset its policy or repeat index semantics.
function isolationArgs(args, list) {
  if (list) {
    const report = JSON.parse(list);
    const graph = report.dependencyGraph;
    if (
      !dependencyComponents(graph) ||
      graph.globalTimeout !== 0 ||
      graph.maxFailures !== 0 ||
      graph.projects.some((p) => p.repeatEach !== 1)
    )
      return null;
  }
  let reporterIndex = -1;
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split('=');
    const known = new Set([
      '--config',
      '-c',
      '--shard',
      '--test-list',
      '--test-list-invert',
      '--output',
      '--grep',
      '-g',
      '--grep-invert',
      '-G',
      '--project',
      '--only-changed',
      '--reporter',
      '--retries',
      '--repeat-each',
      '--workers',
      '-j',
      '--timeout',
      '--global-timeout',
      '--max-failures',
      '-x',
      '--trace',
      '--tsconfig',
      '--last-failed',
      '--last-failed-file',
      '--headed',
      '--debug',
      '--quiet',
      '--forbid-only',
      '--fail-on-flaky-tests',
      '--pass-with-no-tests',
      '--no-deps',
      '--update-snapshots',
      '--update-source-method',
    ]);
    if (flag.startsWith('-') && !known.has(flag)) return null;
    const value = inline ?? args[i + 1];
    if (
      [
        '--last-failed',
        '--last-failed-file',
        '--only-changed',
        '--no-deps',
      ].includes(flag)
    )
      return null;
    if (flag === '--global-timeout' && Number(value) > 0) return null;
    if (
      (flag === '--max-failures' || flag === '-x') &&
      (flag === '-x' || Number(value) > 0)
    )
      return null;
    if (flag === '--repeat-each' && Number(value) > 1) return null;
    if (flag === '--reporter') reporterIndex = i;
  }
  // The standard CI command supplies JSON for completeness and merged receipts.
  if (reporterIndex < 0) return null;
  const inline = args[reporterIndex].includes('=');
  const reporters = (
    inline
      ? args[reporterIndex].slice('--reporter='.length)
      : args[reporterIndex + 1]
  ).split(',');
  if (!reporters.includes('json')) return null;
  if (!reporters.includes('blob')) reporters.push('blob');
  const selected = [...args];
  selected[reporterIndex + (inline ? 0 : 1)] =
    `${inline ? '--reporter=' : ''}${reporters.join(',')}`;
  return selected;
}

async function runSatelliteCohorts({
  cohorts,
  args,
  env,
  webDir,
  run,
  start,
  stop,
  diagnose,
}) {
  const tempRoot = path.resolve(webDir, '../../tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const reportRoot = fs.mkdtempSync(path.join(tempRoot, 'e2e-cohorts-'));
  const blobs = path.join(reportRoot, 'merged-blobs');
  fs.mkdirSync(blobs);
  let firstFailure;
  for (const [index, cohort] of cohorts.entries()) {
    const manifest = path.join(reportRoot, `selected-${index}.txt`);
    fs.writeFileSync(manifest, `${cohort.rows.join('\n')}\n`);
    const cohortBlobDir = path.join(reportRoot, `blob-${index}`);
    const cohortEnv = {
      ...env,
      PLAYWRIGHT_BLOB_OUTPUT_DIR: cohortBlobDir,
      PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(
        reportRoot,
        `results-${index}.json`
      ),
    };
    const runtime = { owned: [], tasks: null };
    try {
      await start(cohort, cohortEnv, runtime);
      const selectedArgs = cohortArgs(
        args,
        manifest,
        path.join(webDir, 'test-results', `cohort-${index}`),
        cohort.dependencies
      );
      await run(selectedArgs, cohortEnv);
      const receipt = JSON.parse(
        fs.readFileSync(cohortEnv.PLAYWRIGHT_JSON_OUTPUT_FILE, 'utf8')
      );
      const counts = ['expected', 'unexpected', 'flaky', 'skipped'].map(
        (key) => receipt.stats?.[key]
      );
      const count = counts.every(
        (value) => Number.isSafeInteger(value) && value >= 0
      )
        ? counts.reduce((sum, value) => sum + value, 0)
        : NaN;
      const actualRows = reportRows(receipt).sort();
      const expectedRows = [...cohort.rows].sort();
      if (
        count !== cohort.rows.length ||
        JSON.stringify(actualRows) !== JSON.stringify(expectedRows)
      )
        throw new Error('Cohort execution did not cover its selected manifest');
    } catch (error) {
      firstFailure ??= error;
      await diagnose(runtime, error);
    } finally {
      await stop(runtime);
    }
    if (fs.existsSync(cohortBlobDir)) {
      for (const name of fs.readdirSync(cohortBlobDir)) {
        if (name.endsWith('.zip'))
          fs.copyFileSync(
            path.join(cohortBlobDir, name),
            path.join(blobs, `${index}-${name}`)
          );
      }
    } else {
      throw firstFailure ?? new Error('Missing cohort report');
    }
  }
  return { blobs, firstFailure };
}
module.exports = {
  reportRows,
  parseDiscoveryOutput,
  dependencyComponents,
  planSatelliteCohorts,
  cohortArgs,
  isolationArgs,
  runSatelliteCohorts,
};
