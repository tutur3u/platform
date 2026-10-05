const { createResourceSampler } = require('./e2e-runtime-resources');

const HEARTBEAT_INTERVAL_MS = 10_000;

// Fixed process roles and numeric deltas only. No fixture, URL, or error data.
function startRuntimeHeartbeat(role, env = process.env) {
  if (role !== 'worker' && role !== 'runner') {
    throw new Error('Invalid E2E diagnostic role');
  }
  if (env.CI !== 'true' && env.E2E_RUNTIME_DIAGNOSTICS !== 'true') {
    return () => {};
  }
  const resources =
    role === 'runner' && process.platform === 'linux'
      ? createResourceSampler()
      : null;
  let wall = Date.now();
  let monotonic = performance.now();
  let cpu = process.cpuUsage();
  const timer = setInterval(() => {
    const nextWall = Date.now();
    const nextMonotonic = performance.now();
    const nextCpu = process.cpuUsage();
    console.info(`[e2e-heartbeat] ${role}`, {
      wallDeltaMs: nextWall - wall,
      monotonicDeltaMs: Math.round(nextMonotonic - monotonic),
      cpuDeltaMs: Math.round(
        (nextCpu.user + nextCpu.system - cpu.user - cpu.system) / 1000
      ),
    });
    void resources?.sample();
    wall = nextWall;
    monotonic = nextMonotonic;
    cpu = nextCpu;
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    resources?.stop();
  };
}

async function withRuntimeHeartbeat(role, action, env = process.env) {
  const stop = startRuntimeHeartbeat(role, env);
  try {
    return await action();
  } finally {
    stop();
  }
}

function runPlaywrightWithHeartbeat(runCommand, args, options) {
  return withRuntimeHeartbeat(
    'runner',
    () => runCommand('bunx', ['playwright', 'test', ...args], options),
    options.env
  );
}

module.exports = {
  runPlaywrightWithHeartbeat,
  HEARTBEAT_INTERVAL_MS,
  startRuntimeHeartbeat,
  withRuntimeHeartbeat,
};
