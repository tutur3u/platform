import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationId } from './prepare.mjs';

const [platform, fixture, device, emulator] = process.argv.slice(2);
if (
  !['android', 'ios'].includes(platform) ||
  !fixture ||
  !device ||
  (platform === 'android' && !emulator)
)
  throw Error('Invalid target');
const expected = JSON.parse(readFileSync(resolve(fixture, 'proof-input.json')));
const app = applicationId(platform);
const evidence = { ...expected, app_id: app, device, phases: [] };
const command = (executable, args) => {
  return execFileSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 65_536,
  }).trim();
};
const adb = (args) => command('adb', ['-s', device, ...args]);
const sim = (args) => command('xcrun', ['simctl', ...args]);
try {
  // Exactly one installation. No pm clear, uninstall, simulator erase, or rebuild.
  if (platform === 'android') {
    adb([
      'install',
      resolve(fixture, 'build/app/outputs/flutter-apk/app-debug.apk'),
    ]);
  } else {
    sim([
      'install',
      device,
      resolve(fixture, 'build/ios/iphonesimulator/Runner.app'),
    ]);
  }
  if (platform === 'android') {
    const property = (name) => adb(['shell', 'getprop', name]);
    evidence.runtime = {
      api: property('ro.build.version.sdk'),
      release: property('ro.build.version.release'),
      abi: property('ro.product.cpu.abi'),
      emulator_version: command(emulator, ['-version']).match(
        /version ([0-9.]+)/
      )?.[1],
      adb_version: command('adb', ['version']).match(/version ([0-9.]+)/)?.[1],
    };
  } else {
    const catalog = JSON.parse(sim(['list', 'devices', '--json']));
    const selected = Object.entries(catalog.devices).find(([, devices]) =>
      devices.some((candidate) => candidate.udid === device)
    );
    const runtimes = JSON.parse(sim(['list', 'runtimes', '--json']));
    const runtime = runtimes.runtimes.find(
      (candidate) => candidate.identifier === selected?.[0]
    );
    if (!runtime) throw Error('Selected runtime unavailable');
    evidence.runtime = {
      identifier: runtime.identifier,
      version: runtime.version,
      build: runtime.buildversion,
      device_id: device,
    };
  }
  if (
    Object.values(evidence.runtime).some(
      (value) =>
        typeof value !== 'string' || !/^[0-9A-Za-z._+-]{1,96}$/.test(value)
    )
  ) {
    throw Error('Actual selected runtime/tool version unavailable');
  }
  for (const phase of ['write', 'read', 'cleanup', 'verify-clean']) {
    if (platform === 'android') {
      adb(['shell', 'am', 'force-stop', app]);
      try {
        const pid = adb(['shell', 'pidof', app]);
        if (pid) throw Error('Process survived force-stop');
      } catch (failure) {
        if (failure.status !== 1) throw failure; // pidof reports absent as exit 1.
      }
    } else if (evidence.phases.length) {
      sim(['terminate', device, app]);
    }
    let reportPath;
    if (platform === 'ios') {
      const container = sim(['get_app_container', device, app, 'data']);
      reportPath = resolve(container, 'Documents/journal-proof.json');
      sim(['launch', device, app, '--journal-phase', phase]);
    } else {
      adb([
        'shell',
        'am',
        'start',
        '-W',
        '-n',
        `${app}/.MainActivity`,
        '--es',
        'journal_phase',
        phase,
      ]);
    }
    const deadline = Date.now() + 90_000;
    let report;
    while (Date.now() < deadline) {
      try {
        const raw =
          platform === 'android'
            ? adb(['shell', 'run-as', app, 'cat', 'files/journal-proof.json'])
            : readFileSync(reportPath, 'utf8');
        if (Buffer.byteLength(raw) > 8192)
          throw Error('Native report too large');
        const candidate = JSON.parse(raw);
        if (candidate.phase === phase && candidate.run_id === expected.run_id) {
          report = candidate;
          break;
        }
      } catch {
        /* File is absent until the new process reports completion. */
      }
      await new Promise((done) => setTimeout(done, 500));
    }
    if (
      !report?.passed ||
      report.source_sha !== expected.source_sha ||
      report.journal_sha256 !== expected.journal_sha256 ||
      !Number.isSafeInteger(report.process_id) ||
      report.process_id <= 0 ||
      JSON.stringify(report.request_ids) !==
        JSON.stringify([
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000003',
        ]) ||
      evidence.phases.some((prior) => prior.process_id === report.process_id)
    ) {
      throw Error(`Missing/failed/new-process phase proof: ${phase}`);
    }
    // Retain only fixture identities/results, never arbitrary native error text.
    evidence.phases.push({
      phase: report.phase,
      passed: true,
      process_id: report.process_id,
      run_id: expected.run_id,
      source_sha: expected.source_sha,
      journal_sha256: expected.journal_sha256,
      request_ids: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
    });
  }
  evidence.passed = true;
} catch {
  evidence.passed = false;
  evidence.error = 'native_proof_failed';
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(fixture, 'native-proof.json'),
    JSON.stringify(evidence, null, 2)
  );
}
