// Durable stop fence plus the per-run operation budget.
//
// The STOP file lives on the operator host next to the ledger. Every Storage or
// database operation calls `beforeOperation()` first, so creating the file halts
// the job before its next side effect, even across restarts.

import fs from 'node:fs';

export class StopRequested extends Error {
  constructor(reason) {
    super(`Stopped: ${reason}`);
    this.name = 'StopRequested';
    this.reason = reason;
  }
}

export function createStopFence({ stopFile, maxOps, fsImpl = fs }) {
  if (!stopFile) throw new Error('A stop file path is required');
  if (!Number.isInteger(maxOps) || maxOps < 1) {
    throw new Error('maxOps must be a positive integer');
  }
  let used = 0;
  return {
    get used() {
      return used;
    },
    get remaining() {
      return maxOps - used;
    },
    check() {
      if (fsImpl.existsSync(stopFile)) throw new StopRequested('stop_file');
    },
    beforeOperation() {
      this.check();
      if (used >= maxOps) throw new StopRequested('max_ops');
      used += 1;
    },
  };
}
