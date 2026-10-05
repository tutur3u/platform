const ownedRuntimes = new Set();
const signalHandlers = new Map();

function registerOwnedRuntime(runtime) {
  ownedRuntimes.add(runtime);
  if (!signalHandlers.size) {
    for (const [signal, number] of [
      ['SIGTERM', 15],
      ['SIGINT', 2],
    ]) {
      const handler = () => {
        for (const owned of ownedRuntimes) {
          try {
            signalOwnedProcess(owned, 'SIGKILL');
          } catch (error) {
            console.error(error);
          }
        }
        // Preserve termination semantics; installing listeners must not ignore TERM.
        process.exit(128 + number);
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  }
  return runtime;
}

function releaseOwnedRuntime(runtime) {
  ownedRuntimes.delete(runtime);
  if (!ownedRuntimes.size) {
    for (const [signal, handler] of signalHandlers)
      process.off(signal, handler);
    signalHandlers.clear();
  }
}

// Only signal the process group created by this fixture; never inspect host args.
function signalOwnedProcess(runtime, signal, kill = process.kill) {
  if (runtime.processGroup && Number.isSafeInteger(runtime.child.pid)) {
    try {
      kill(-runtime.child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  } else {
    runtime.child.kill(signal);
  }
}
async function waitForOwnedExit(runtime, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      runtime.exitPromise.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
module.exports = {
  signalOwnedProcess,
  waitForOwnedExit,
  registerOwnedRuntime,
  releaseOwnedRuntime,
};
