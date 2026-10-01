import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function applicationId(platform) {
  if (platform === 'android')
    return 'dev.tuturuuu.fixture.sale_journal_fixture';
  if (platform === 'ios') return 'dev.tuturuuu.fixture.sale-journal-fixture';
  throw Error('Invalid platform');
}

export function renderIosProject(project) {
  return project.replace(
    /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g,
    (_, original) =>
      `PRODUCT_BUNDLE_IDENTIFIER = ${applicationId('ios')}${original.includes('RunnerTests') ? '.RunnerTests' : ''};`
  );
}

export function assertDiskAdmission(platform, mode, freeGiB) {
  applicationId(platform);
  const minimum =
    mode === '--preflight' ? (platform === 'android' ? 20 : 12) : 4;
  if (!Number.isFinite(freeGiB) || freeGiB < minimum)
    throw Error('Insufficient disposable-runner disk');
  return minimum;
}

export function validateArtifactItems(items) {
  const allowlist = [
    'environment.json',
    'native-proof.json',
    'proof-input.json',
  ];
  if (
    items.length !== 3 ||
    JSON.stringify(items.map(([name]) => name).sort()) !==
      JSON.stringify(allowlist)
  ) {
    throw Error('Artifact allowlist mismatch');
  }
  let total = 0;
  for (const [, content] of items) {
    const size = Buffer.byteLength(content);
    total += size;
    if (size > 65_536 || total > 196_608)
      throw Error('Artifact size cap exceeded');
  }
  return total;
}

export function prepare(args = process.argv.slice(2)) {
  const [platform, destination, mode] = args;
  if (!['android', 'ios'].includes(platform) || !destination)
    throw Error('Invalid target');
  const freeGiB =
    (Number(statfsSync(process.env.RUNNER_TEMP).bavail) *
      Number(statfsSync(process.env.RUNNER_TEMP).bsize)) /
    2 ** 30;
  const minimum = assertDiskAdmission(platform, mode, freeGiB);
  if (mode === '--preflight' || mode === '--runtime-preflight') {
    console.log(
      `Fixture preflight PASS: ${platform}, minimum ${minimum} GiB free`
    );
    process.exit(0);
  }
  if (mode === '--artifacts') {
    const inputFile = resolve(destination, 'proof-input.json');
    if (statSync(inputFile).size > 65_536)
      throw Error('Input size cap exceeded');
    const input = JSON.parse(readFileSync(inputFile));
    const flutter = JSON.parse(
      execFileSync('flutter', ['--version', '--machine'], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 65_536,
        stdio: 'pipe',
      })
    );
    const metadata = {
      ...input,
      node: process.version,
      flutter: flutter.frameworkVersion,
      dart: flutter.dartSdkVersion,
      engine_revision: flutter.engineRevision,
      final_free_gib: Math.floor(freeGiB),
      secure_storage_versions: {},
    };
    const lockFile = resolve(destination, 'pubspec.lock');
    if (statSync(lockFile).size > 1_048_576)
      throw Error('Resolved lock too large');
    const lock = readFileSync(lockFile, 'utf8');
    metadata.resolved_lock_sha256 = createHash('sha256')
      .update(lock)
      .digest('hex');
    let packageName;
    for (const line of lock.split('\n')) {
      const name = /^ {2}(flutter_secure_storage(?:_[a-z_]+)?):$/.exec(line);
      if (/^ {2}[a-z_]+:$/.test(line)) packageName = name?.[1];
      const version = /^ {4}version: "([0-9][0-9A-Za-z.+-]*)"$/.exec(line);
      if (packageName && version)
        metadata.secure_storage_versions[packageName] = version[1];
    }
    if (platform === 'android') {
      const java = spawnSync('java', ['-version'], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 65_536,
      });
      metadata.java = /version "([0-9][0-9A-Za-z._+-]*)"/.exec(
        java.stderr
      )?.[1];
    } else {
      const xcode = execFileSync('xcodebuild', ['-version'], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 65_536,
        stdio: 'pipe',
      });
      metadata.xcode = /^Xcode ([0-9.]+)/m.exec(xcode)?.[1];
      metadata.xcode_build = /^Build version ([A-Za-z0-9]+)/m.exec(xcode)?.[1];
    }
    const proofFile = resolve(destination, 'native-proof.json');
    if (statSync(proofFile).size > 65_536)
      throw Error('Native proof too large');
    const versions = [
      metadata.flutter,
      metadata.dart,
      metadata.engine_revision,
      platform === 'android' ? metadata.java : metadata.xcode,
      metadata.secure_storage_versions.flutter_secure_storage,
    ];
    if (
      versions.some(
        (value) =>
          typeof value !== 'string' || !/^[0-9A-Za-z.+_ -]{1,96}$/.test(value)
      )
    )
      throw Error('Tool version unavailable');
    const artifacts = resolve(destination, 'artifacts');
    mkdirSync(artifacts, { recursive: true });
    const items = [
      ['proof-input.json', JSON.stringify(input)],
      ['environment.json', JSON.stringify(metadata)],
      ['native-proof.json', readFileSync(proofFile, 'utf8')],
    ];
    validateArtifactItems(items);
    for (const [name, content] of items) {
      writeFileSync(resolve(artifacts, name), content);
    }
    process.exit(0);
  }
  const root = process.cwd();
  const fixture = resolve(root, 'tools/inventory-native-journal-fixture');
  const journal = resolve(
    root,
    'apps/mobile/lib/data/sources/inventory_sale_journal.dart'
  );
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  const run =
    process.env.GITHUB_RUN_ID +
    '-' +
    process.env.GITHUB_RUN_ATTEMPT +
    '-' +
    platform;
  if (!/^\d+-\d+-(android|ios)$/.test(run))
    throw Error('Missing unique CI run identity');
  execFileSync(
    'flutter',
    [
      'create',
      '--no-pub',
      `--platforms=${platform}`,
      '--org',
      'dev.tuturuuu.fixture',
      '--project-name',
      'sale_journal_fixture',
      destination,
    ],
    { stdio: 'pipe', timeout: 120_000, maxBuffer: 65_536 }
  );
  copyFileSync(
    resolve(fixture, 'pubspec.yaml'),
    resolve(destination, 'pubspec.yaml')
  );
  // Seed the exact app lock; pub get prunes unrelated entries in the disposable target.
  copyFileSync(
    resolve(root, 'apps/mobile/pubspec.lock'),
    resolve(destination, 'pubspec.lock')
  );
  copyFileSync(
    resolve(fixture, 'lib/main.dart'),
    resolve(destination, 'lib/main.dart')
  );
  copyFileSync(
    journal,
    resolve(destination, 'lib/inventory_sale_journal.dart')
  );
  const digest = createHash('sha256')
    .update(readFileSync(journal))
    .digest('hex');
  if (platform === 'android') {
    const native = resolve(
      destination,
      'android/app/src/main/kotlin/dev/tuturuuu/fixture/sale_journal_fixture'
    );
    mkdirSync(native, { recursive: true });
    copyFileSync(
      resolve(fixture, 'native/MainActivity.kt'),
      resolve(native, 'MainActivity.kt')
    );
    const gradle = resolve(destination, 'android/app/build.gradle.kts');
    const configured = readFileSync(gradle, 'utf8')
      .replace(
        /namespace = "[^"]+"/,
        'namespace = "dev.tuturuuu.fixture.sale_journal_fixture"'
      )
      .replace(
        /applicationId = "[^"]+"/,
        'applicationId = "dev.tuturuuu.fixture.sale_journal_fixture"'
      );
    writeFileSync(gradle, configured);
  } else {
    const project = resolve(
      destination,
      'ios/Runner.xcodeproj/project.pbxproj'
    );
    writeFileSync(project, renderIosProject(readFileSync(project, 'utf8')));
    copyFileSync(
      resolve(fixture, 'native/AppDelegate.swift'),
      resolve(destination, 'ios/Runner/AppDelegate.swift')
    );
  }
  writeFileSync(
    resolve(destination, 'proof-input.json'),
    JSON.stringify({
      source_sha: sha,
      run_id: run,
      journal_sha256: digest,
      platform,
    })
  );
  writeFileSync(
    resolve(destination, 'defines.json'),
    JSON.stringify({
      SOURCE_SHA: sha,
      FIXTURE_RUN: run,
      JOURNAL_SHA256: digest,
    })
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  prepare();
}
