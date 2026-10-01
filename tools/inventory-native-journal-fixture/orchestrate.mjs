import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [platform, fixture, device] = process.argv.slice(2);
if (!['android', 'ios'].includes(platform) || !fixture || !device)
  throw Error('Invalid target');
const expected = JSON.parse(readFileSync(resolve(fixture, 'proof-input.json')));
const app = 'dev.tuturuuu.fixture.sale_journal_fixture';
const evidence = { ...expected, app_id: app, device, phases: [], commands: [] };
const command = (executable, args) => {
  evidence.commands.push([executable, ...args]);
  return execFileSync(executable, args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
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
      !report.process_id ||
      evidence.phases.some((prior) => prior.process_id === report.process_id)
    ) {
      throw Error(`Missing/failed/new-process phase proof: ${phase}`);
    }
    evidence.phases.push(report);
  }
  evidence.passed = true;
} catch (failure) {
  evidence.passed = false;
  evidence.error = failure.message;
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(fixture, 'native-proof.json'),
    JSON.stringify(evidence, null, 2)
  );
}
