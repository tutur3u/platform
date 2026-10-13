import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  removeEmployeeNetwork,
  startEmployeeNetworkObserver,
} from './employee-schema-network.mjs';
import {
  emptyEmployeeRelayEvidence,
  emptyEmployeeStartEvidence,
  finishEmployeeControllerWorkers,
} from './employee-schema-typegen.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const controller = readFileSync(
  new URL('./verify-employee-schema-contract.mjs', import.meta.url),
  'utf8'
);
// Execute the actual finalization and both artifact writes without running admission.
const persist = new (Object.getPrototypeOf(async () => {}).constructor)(
  'inputs',
  `const { networkObserver, relay, startupObserver, receiptDirectory, network,
    sourceSha, controlSha, finishEmployeeControllerWorkers, writeFileSync, path } = inputs;
   const schemaReceipt = () => ({version: 1, sourceSha, schemaQualified: false, assertions: 0});
   const packets = [], lifecycleCode = 1, schemaExecutionSucceeded = false,
     cleanupSucceeded = false, snapshotSha256 = '', typegenReceipt = null,
     fixtureHashes = {}, failureDiagnostic = undefined;
   ${controller.slice(controller.indexOf('const finalization ='), controller.indexOf('console.log(', controller.indexOf('const finalization =')))}
   return receipt;`
);

for (const mode of ['owned-descendant', 'unknown-group', 'retained-pipe']) {
  test(`primary shutdown ${mode} settles and persists denied artifacts`, {
    timeout: 20000,
  }, async (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'employee-shutdown-'));
    const context = {
      source: 'a'.repeat(40),
      control: 'b'.repeat(40),
      run: '123',
      attempt: '1',
      project: 'tt-source-aaaaaaaa-0123456789',
      name: 'tt-employee-net-123-1',
      marker: path.join(directory, 'owned.json'),
      receiptDirectory: directory,
    };
    const network = {
      id: 'd'.repeat(64),
      name: context.name,
      labels: Object.fromEntries(
        ['source', 'control', 'run', 'attempt', 'project'].map((key) => [
          `ttr.employee.${key}`,
          context[key],
        ])
      ),
    };
    network.labels['ttr.employee.nonce'] =
      '00000000-0000-4000-8000-000000000000';
    writeFileSync(context.marker, JSON.stringify(network));
    let child,
      holderPid,
      closeSeen = false,
      cleanupSignaled = false;
    const realKill = process.kill.bind(process);
    const exists = (pid) => {
      try {
        realKill(pid, 0);
        return true;
      } catch (error) {
        return error.code !== 'ESRCH';
      }
    };
    const killOwned = (pid) => {
      try {
        realKill(pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const signalCleanup = () => {
      process.kill = realKill;
      if (cleanupSignaled) return;
      cleanupSignaled = true;
      if (child?.pid) killOwned(-child.pid);
      if (holderPid && mode === 'retained-pipe') killOwned(-holderPid);
    };
    t.after(async () => {
      signalCleanup();
      const until = Date.now() + 3000;
      while (
        (exists(-child.pid) ||
          (mode === 'retained-pipe' && exists(-holderPid))) &&
        Date.now() < until
      )
        await pause(25);
      assert.equal(exists(-child.pid), false, 'fixture group cleanup');
      if (mode === 'retained-pipe') assert.equal(exists(-holderPid), false);
      rmSync(directory, { recursive: true, force: true });
    });
    const observer = startEmployeeNetworkObserver(context.project, network.id, {
      timeoutMs: 15000,
      spawnEvents: (_command, _args, options) => {
        assert.equal(options.detached, true);
        child = spawn(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `
          import { spawn } from 'node:child_process';
          const holder = spawn(process.execPath, ['-e',
            "process.on('SIGTERM',()=>{});process.send('ready');setTimeout(()=>process.exit(),15000)"],
            { detached: ${mode === 'retained-pipe'}, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
          holder.once('message', () => process.send(holder.pid));
          process.on('SIGTERM', () => process.exit(0));
          setTimeout(() => process.exit(0), 15000);
        `,
          ],
          { ...options, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
        );
        child.once('close', () => {
          closeSeen = true;
        });
        return child;
      },
      runner: async () => {
        throw new Error('No Docker operation admitted');
      },
    });
    [holderPid] = await once(child, 'message');
    assert.equal(exists(holderPid), true);
    assert.equal(exists(-child.pid), true);
    if (mode === 'unknown-group') {
      process.kill = (pid, signal) => {
        if (pid === -child.pid && signal === 0) {
          throw Object.assign(new Error('synthetic unknown group'), {
            code: 'EPERM',
          });
        }
        return realKill(pid, signal);
      };
    }
    const attempts = [];
    const start = Date.now();
    const completion = persist({
      networkObserver: observer,
      relay: {
        finish: async () => {
          attempts.push('relay');
          return {
            ...emptyEmployeeRelayEvidence(),
            drained: true,
            denied: true,
          };
        },
      },
      startupObserver: {
        finish: async () => {
          attempts.push('startup');
          return { ...emptyEmployeeStartEvidence(), observerDrained: true };
        },
      },
      receiptDirectory: directory,
      network,
      sourceSha: context.source,
      controlSha: context.control,
      finishEmployeeControllerWorkers,
      writeFileSync,
      path,
    });
    let timer;
    const outcome = await Promise.race([
      completion,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), 6500);
      }),
    ]);
    clearTimeout(timer);
    try {
      assert.notEqual(
        outcome,
        null,
        'finish must settle before inherited-pipe watchdog'
      );
      assert.ok(Date.now() - start < 6500);
      assert.deepEqual(attempts, ['relay', 'startup']);
      assert.equal(outcome.networkObserverDrained, mode === 'owned-descendant');
      assert.equal(
        outcome.networkProof.observerDrained,
        mode === 'owned-descendant'
      );
      assert.equal(outcome.controllerQualified, false);
      assert.equal(outcome.combinedQualified, false);
      assert.equal(exists(-child.pid), false, 'actual owned group absent');
      if (mode !== 'retained-pipe') {
        assert.equal(exists(holderPid), false, 'actual descendant absent');
        assert.equal(closeSeen, true);
      }
      assert.deepEqual(
        outcome.workerFinishFailures,
        mode === 'owned-descendant' ? [] : ['network-drain-unconfirmed']
      );
      assert.equal(
        JSON.parse(readFileSync(path.join(directory, 'start-evidence.json')))
          .evidence.observerDrained,
        true
      );
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(directory, 'qualification.json'))),
        outcome
      );
      let removals = 0;
      const removal = removeEmployeeNetwork('/synthetic', {
        context,
        runner: async (_command, args) => {
          if (args[1] === 'rm') {
            removals++;
            return Buffer.from(network.id);
          }
          if (args[0] === 'ps' || args[1] === 'ls') return Buffer.from('');
          return Buffer.from(
            JSON.stringify([
              {
                Id: network.id,
                Name: network.name,
                Internal: true,
                Driver: 'bridge',
                Labels: network.labels,
                Containers: {},
              },
            ])
          );
        },
      });
      if (mode === 'owned-descendant') await removal;
      else await assert.rejects(removal);
      assert.equal(removals, mode === 'owned-descendant' ? 1 : 0);
      t.diagnostic(
        JSON.stringify({
          mode,
          groupAbsent: true,
          descendantAbsent: mode !== 'retained-pipe',
          observerDrained: outcome.networkObserverDrained,
          removals,
        })
      );
    } finally {
      signalCleanup();
      await completion;
    }
  });
}
