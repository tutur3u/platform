// The generated Worker's effective settings: the template's defaults plus
// `worker` and `mounts` from the app-owned start-bridge.config.ts. The codemod
// emits them into void.config.ts, the sealed artifact identity and the runtime
// test; the runtime test recomputes them from the config, so an edit to the
// config without a re-run fails CI instead of drifting.
// Plain ESM with no dependencies: the generated runtime test imports it.

/** Always on: Node APIs, and same-zone self-fetches reaching this Worker. */
export const REQUIRED_FLAGS = ['nodejs_compat', 'global_fetch_strictly_public'];
const FLAG = /^[a-z][a-z0-9_]*$/u;
const WORKERS_DEV_HOST = /\.workers\.dev$/iu;

const effectiveMounts = (appConfig, defaultMounts) => ({
  ...defaultMounts,
  ...appConfig?.mounts,
});

/**
 * `workersDev` defaults to off for an app that rejects unknown hosts (a
 * root-only cutover) and stays on otherwise; flags are the required ones
 * plus the app's, in order, without duplicates.
 */
export function effectiveWorkerConfig(appConfig, defaultMounts) {
  const worker = appConfig?.worker ?? {};
  const mounts = effectiveMounts(appConfig, defaultMounts);
  return {
    workersDev: worker.workersDev ?? mounts.unknownHost !== 'reject',
    compatibilityFlags: [
      ...new Set([...REQUIRED_FLAGS, ...(worker.compatibilityFlags ?? [])]),
    ],
  };
}

/** Problems with the app's `worker` options, against its effective mounts. */
export function workerConfigProblems(appConfig, defaultMounts) {
  const worker = appConfig?.worker;
  if (
    worker !== undefined &&
    (typeof worker !== 'object' || worker === null || Array.isArray(worker))
  )
    return ['worker must be an object'];
  const problems = [];
  for (const key of Object.keys(worker ?? {}))
    if (key !== 'workersDev' && key !== 'compatibilityFlags')
      problems.push(`worker.${key} is not a supported option`);
  if (
    worker?.workersDev !== undefined &&
    typeof worker.workersDev !== 'boolean'
  )
    problems.push('worker.workersDev must be a boolean');
  const flags = worker?.compatibilityFlags;
  if (
    flags !== undefined &&
    !(Array.isArray(flags) && flags.every((flag) => FLAG.test(flag)))
  )
    problems.push(
      'worker.compatibilityFlags must be an array of compatibility flag names'
    );
  const mounts = effectiveMounts(appConfig, defaultMounts);
  if (
    !effectiveWorkerConfig(appConfig, defaultMounts).workersDev &&
    (mounts.rootHosts ?? []).some((host) => WORKERS_DEV_HOST.test(host))
  )
    problems.push(
      'mounts.rootHosts lists a workers.dev host but workers_dev is off: set worker.workersDev to true or drop that host'
    );
  return problems;
}
