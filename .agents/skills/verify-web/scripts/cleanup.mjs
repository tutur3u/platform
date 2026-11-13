import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findRepoRoot,
  isOwnedProcess,
  killOwned,
  processSnapshot,
  readState,
  skillPaths,
} from './lib.mjs';

const root = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
const { statePath, logPath } = skillPaths(root);
const state = readState(statePath);

if (!state) {
  console.log('verify-web cleanup: nothing recorded');
  process.exit(0);
}

const snapshot = processSnapshot(state.pid);
if (!isOwnedProcess(state, snapshot)) {
  fs.rmSync(statePath, { force: true });
  console.log(
    snapshot
      ? `verify-web cleanup: left pid ${state.pid} alone; it is not the server this skill started`
      : 'verify-web cleanup: recorded server is already gone'
  );
  process.exit(0);
}

const result = killOwned(state);
if (!result.killed) {
  console.error(`verify-web cleanup: FAIL ${result.reason}`);
  process.exit(1);
}

fs.rmSync(statePath, { force: true });
console.log(`verify-web cleanup: stopped pid ${state.pid} on port ${state.port}`);
console.log(`log: ${logPath}`);
