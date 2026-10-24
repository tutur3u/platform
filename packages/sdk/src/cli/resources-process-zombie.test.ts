import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { spawnResourceCommand } from './resources-broker';
import {
  observeProcess,
  snapshotProcesses,
} from './resources-process-identity';
import { realNode } from './resources-test-fixtures';

it.runIf(process.platform === 'darwin')(
  'reads an unreaped zombie and drains an unrelated owned relay',
  { timeout: 15_000 },
  async () => {
    // The parent reaps only after stdin closes. No process signals are needed.
    const parent = spawn(
      '/usr/bin/python3',
      [
        '-I',
        '-S',
        '-c',
        'import os,sys\npid=os.fork()\nif pid==0: os._exit(0)\nprint(pid,flush=True)\nsys.stdin.read()\nos.waitpid(pid,0)',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const closed = once(parent, 'close');
    let output = '';
    parent.stdout.setEncoding('utf8');
    parent.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    try {
      const deadline = Date.now() + 5000;
      let pid = 0;
      for (;;) {
        pid = Number(output.trim());
        if (
          Number.isInteger(pid) &&
          pid > 0 &&
          execFileSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)], {
            encoding: 'utf8',
          })
            .trim()
            .startsWith('Z')
        )
          break;
        if (Date.now() >= deadline)
          throw new Error('The native fixture did not produce a zombie');
        await sleep(20);
      }
      const observed = observeProcess(pid);
      expect(observed.kind).toBe('present');
      if (observed.kind !== 'present')
        throw new Error('Zombie metadata is unavailable');
      expect(observed.process.zombie).toBe(true);
      const snapshot = snapshotProcesses();
      expect(snapshot.kind).toBe('ready');
      if (snapshot.kind !== 'ready')
        throw new Error('Native inventory is unavailable');
      expect(snapshot.unavailable.some((row) => row.pid === pid)).toBe(false);
      expect(snapshot.processes.find((row) => row.pid === pid)?.zombie).toBe(
        true
      );
      // The zombie stays unreaped throughout the public broker call.
      expect(
        await spawnResourceCommand(realNode, ['-e', ''], process.env, true)
      ).toBe(0);
    } finally {
      parent.stdin.end();
      await closed;
    }
  }
);
