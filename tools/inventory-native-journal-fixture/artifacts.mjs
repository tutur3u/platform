import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function validateArtifactItems(items) {
  const names = ['environment.json', 'native-proof.json', 'proof-input.json'];
  if (
    items.length !== 3 ||
    JSON.stringify(items.map(([name]) => name).sort()) !== JSON.stringify(names)
  )
    throw Error('Artifact allowlist mismatch');
  let total = 0;
  for (const [, content] of items) {
    const size = Buffer.byteLength(content);
    total += size;
    if (size > 65_536 || total > 196_608)
      throw Error('Artifact size cap exceeded');
  }
  return total;
}

export function writeArtifactItems(destination, items) {
  validateArtifactItems(items);
  const directory = resolve(destination, 'artifacts');
  mkdirSync(directory, { recursive: true });
  for (const [name, content] of items)
    writeFileSync(resolve(directory, name), content);
}

const text = (value, pattern = /^[0-9A-Za-z.+_ -]{1,96}$/) =>
  typeof value === 'string' && pattern.test(value) ? value : null;
const read = (file, limit = 65_536) => {
  if (statSync(file).size > limit) throw Error('Input size cap exceeded');
  return readFileSync(file, 'utf8');
};

// Failed preparation/build/proof still emits bounded fixed-code evidence.
// Raw tool output, exceptions, arbitrary input fields and lock content never escape.
export function collectArtifacts(
  platform,
  destination,
  { freeGiB = null, command = execFileSync } = {}
) {
  const errors = [];
  const attempt = (code, action) => {
    try {
      return action();
    } catch {
      errors.push(code);
      return null;
    }
  };
  const rawInput = attempt('input_unavailable', () =>
    JSON.parse(read(resolve(destination, 'proof-input.json')))
  );
  const input = {
    platform,
    source_sha: text(rawInput?.source_sha, /^[0-9a-f]{40}$/),
    run_id: text(rawInput?.run_id, /^\d+-\d+-(android|ios)$/),
    journal_sha256: text(rawInput?.journal_sha256, /^[0-9a-f]{64}$/),
  };
  if (
    !input.source_sha ||
    !input.run_id ||
    !input.journal_sha256 ||
    rawInput?.platform !== platform
  )
    errors.push('input_identity_invalid');
  const tool = (name, args) =>
    command(name, args, {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 65_536,
      stdio: 'pipe',
    });
  const flutter = attempt('flutter_version_unavailable', () =>
    JSON.parse(tool('flutter', ['--version', '--machine']))
  );
  const environment = {
    ...input,
    node: process.version,
    flutter: text(flutter?.frameworkVersion),
    dart: text(flutter?.dartSdkVersion),
    engine_revision: text(flutter?.engineRevision),
    final_free_gib: Number.isFinite(freeGiB) ? Math.floor(freeGiB) : null,
    secure_storage_versions: {},
  };
  attempt('lock_unavailable', () => {
    const lock = read(resolve(destination, 'pubspec.lock'), 1_048_576);
    environment.resolved_lock_sha256 = createHash('sha256')
      .update(lock)
      .digest('hex');
    let name;
    for (const line of lock.split('\n')) {
      if (/^ {2}[a-z_]+:$/.test(line))
        name = /^ {2}(flutter_secure_storage(?:_[a-z_]+)?):$/.exec(line)?.[1];
      const version = /^ {4}version: "([0-9][0-9A-Za-z.+-]*)"$/.exec(line)?.[1];
      if (name && version) environment.secure_storage_versions[name] = version;
    }
  });
  if (platform === 'android') {
    // java writes its version to stderr; shell redirection is fixed and captures no log export.
    environment.java = attempt('java_version_unavailable', () =>
      text(
        /version "([0-9][0-9A-Za-z._+-]*)"/.exec(
          tool('sh', ['-c', 'java -version 2>&1'])
        )?.[1]
      )
    );
  } else {
    const xcode = attempt('xcode_version_unavailable', () =>
      tool('xcodebuild', ['-version'])
    );
    environment.xcode = text(/^Xcode ([0-9.]+)/m.exec(xcode ?? '')?.[1]);
    environment.xcode_build = text(
      /^Build version ([A-Za-z0-9]+)/m.exec(xcode ?? '')?.[1]
    );
  }
  const build = attempt('build_status_unavailable', () =>
    JSON.parse(read(resolve(destination, 'build-status.json')))
  );
  environment.build = {
    stage: ['pub_get', 'build', 'complete'].includes(build?.stage)
      ? build.stage
      : 'unavailable',
    passed: build?.passed === true,
    exit_code: Number.isSafeInteger(build?.exit_code) ? build.exit_code : null,
  };
  const raw = attempt('native_proof_unavailable', () =>
    JSON.parse(read(resolve(destination, 'native-proof.json')))
  );
  const runtime = {};
  for (const name of [
    'api',
    'release',
    'abi',
    'emulator_version',
    'adb_version',
    'identifier',
    'version',
    'build',
    'device_id',
  ]) {
    if (raw?.runtime?.[name] !== undefined)
      runtime[name] = text(raw.runtime[name], /^[0-9A-Za-z._+-]{1,96}$/);
  }
  const phases = (Array.isArray(raw?.phases) ? raw.phases : [])
    .slice(0, 4)
    .map((phase) => {
      if (phase === null || typeof phase !== 'object' || Array.isArray(phase)) {
        errors.push('native_proof_malformed');
        return { phase: null, passed: false, process_id: null, ...input };
      }
      return {
        phase: ['write', 'read', 'cleanup', 'verify-clean'].includes(
          phase.phase
        )
          ? phase.phase
          : null,
        passed:
          phase.passed === true &&
          phase.source_sha === input.source_sha &&
          phase.run_id === input.run_id &&
          phase.journal_sha256 === input.journal_sha256,
        process_id:
          Number.isSafeInteger(phase.process_id) && phase.process_id > 0
            ? phase.process_id
            : null,
        ...input,
      };
    });
  const versions = [
    environment.flutter,
    environment.dart,
    environment.engine_revision,
    platform === 'android' ? environment.java : environment.xcode,
    environment.secure_storage_versions.flutter_secure_storage,
  ];
  if (versions.some((value) => !text(value)))
    errors.push('tool_version_unavailable');
  const runtimeNames =
    platform === 'android'
      ? ['api', 'release', 'abi', 'emulator_version', 'adb_version']
      : ['identifier', 'version', 'build', 'device_id'];
  if (runtimeNames.some((name) => !runtime[name]))
    errors.push('runtime_metadata_unavailable');
  const nativePassed =
    raw?.passed === true &&
    raw?.source_sha === input.source_sha &&
    raw?.run_id === input.run_id &&
    raw?.journal_sha256 === input.journal_sha256 &&
    phases.length === 4 &&
    phases.every(
      (phase, index) =>
        phase.passed &&
        phase.process_id &&
        phase.phase === ['write', 'read', 'cleanup', 'verify-clean'][index]
    ) &&
    new Set(phases.map((phase) => phase.process_id)).size === 4;
  const passed =
    errors.length === 0 && environment.build.passed && nativePassed;
  const proof = {
    ...input,
    passed,
    error: passed ? null : 'evidence_incomplete',
    runtime,
    phases,
    collection_errors: [...new Set(errors)],
  };
  environment.collection_errors = proof.collection_errors;
  writeArtifactItems(destination, [
    ['proof-input.json', JSON.stringify(input)],
    ['environment.json', JSON.stringify(environment)],
    ['native-proof.json', JSON.stringify(proof)],
  ]);
  return passed;
}
