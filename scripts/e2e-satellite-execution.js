const fs = require('node:fs');
const path = require('node:path');
const {
  planSatelliteCohorts,
  isUnparsedDiscoveryOutput,
  isolationArgs,
  runSatelliteCohorts,
} = require('./e2e-satellite-cohorts');
const {
  startOwnedSatelliteFixtures,
  stopOwnedSatellite,
  printOwnedSatelliteLog,
  getOwnedSatellitesPlaywrightEnv,
} = require('./e2e-owned-satellites');
const {
  startTasksSatellite,
  waitForTasksSatellite,
  stopTasksSatellite,
  printTasksSatelliteLog,
  getTasksSatellitePortlessEnv,
  getTasksSatellitePlaywrightEnv,
} = require('./e2e-tasks-satellite');
const { runPlaywrightWithHeartbeat } = require('./ci/e2e-runtime-heartbeat');

async function runFixtureLifecycle({ start, run, diagnose, stop, runtime }) {
  let primary;
  try {
    await start(runtime);
    await run(runtime);
  } catch (error) {
    primary = error;
    try {
      await diagnose(runtime, error);
    } catch (diagnosticError) {
      console.error(diagnosticError);
    }
  } finally {
    try {
      await stop(runtime);
    } catch (cleanupError) {
      if (!primary) primary = cleanupError;
      else console.error(cleanupError);
    }
  }
  if (primary) throw primary;
}

async function runE2ESatelliteFixtures({
  args,
  list,
  env,
  webDir,
  runCommand,
  ensurePortlessRoute,
  waitForUrl,
  satellites,
  tasksRequired,
}) {
  const start = async (cohort, cohortEnv, runtime) => {
    await startOwnedSatelliteFixtures(cohort.satellites, runtime.owned, {
      env: cohortEnv,
      ensurePortlessRoute,
      waitForUrl,
    });
    runtime.env = getOwnedSatellitesPlaywrightEnv(cohort.satellites, cohortEnv);
    if (cohort.tasks) {
      runtime.tasks = startTasksSatellite({ env: cohortEnv });
      await ensurePortlessRoute({
        env: getTasksSatellitePortlessEnv(cohortEnv),
      });
      await waitForTasksSatellite(runtime.tasks, waitForUrl);
      runtime.env = getTasksSatellitePlaywrightEnv(runtime.env);
    }
  };
  const stop = async (runtime) => {
    let failure;
    for (const [fixture, cleanup] of [
      [runtime.tasks, stopTasksSatellite],
      ...runtime.owned
        .slice()
        .reverse()
        .map((item) => [item, stopOwnedSatellite]),
    ]) {
      try {
        await cleanup(fixture);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  };
  const diagnose = async (runtime) => {
    if (runtime.tasks) printTasksSatelliteLog(runtime.tasks);
    for (const fixture of runtime.owned) printOwnedSatelliteLog(fixture);
  };
  const cohorts =
    env.CI === 'true' &&
    !isUnparsedDiscoveryOutput(list) &&
    (satellites.length || tasksRequired)
      ? planSatelliteCohorts(list, env)
      : [];
  const isolatedArgs = isUnparsedDiscoveryOutput(list)
    ? null
    : isolationArgs(args, list || null);
  if (cohorts.length < 2 || !isolatedArgs) {
    const runtime = { owned: [], tasks: null };
    await runFixtureLifecycle({
      runtime,
      start: () => start({ satellites, tasks: tasksRequired }, env, runtime),
      run: () =>
        runPlaywrightWithHeartbeat(runCommand, args, {
          cwd: webDir,
          env: runtime.env,
        }),
      diagnose,
      stop,
    });
    return;
  }
  let activeEnv;
  const result = await runSatelliteCohorts({
    cohorts,
    args: isolatedArgs,
    env,
    webDir,
    start: async (cohort, cohortEnv, runtime) => {
      await start(cohort, cohortEnv, runtime);
      activeEnv = runtime.env;
    },
    run: (selectedArgs) =>
      runPlaywrightWithHeartbeat(runCommand, selectedArgs, {
        cwd: webDir,
        env: activeEnv,
      }),
    stop,
    diagnose,
  });
  const combined = path.join(webDir, 'blob-report');
  fs.mkdirSync(combined, { recursive: true });
  for (const file of fs.readdirSync(result.blobs)) {
    fs.copyFileSync(path.join(result.blobs, file), path.join(combined, file));
  }
  await mergeCohortReports(result, runCommand, { cwd: webDir, env });
}
module.exports = { runE2ESatelliteFixtures, runFixtureLifecycle };

async function mergeCohortReports(result, runCommand, options) {
  try {
    await runCommand(
      'bunx',
      ['playwright', 'merge-reports', '--reporter=json', result.blobs],
      options
    );
  } catch (error) {
    if (!result.firstFailure) throw error;
    console.error(error);
  }
  if (result.firstFailure) throw result.firstFailure;
}
module.exports.mergeCohortReports = mergeCohortReports;
