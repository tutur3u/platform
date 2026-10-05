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
module.exports = { signalOwnedProcess, waitForOwnedExit };
