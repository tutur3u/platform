import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectArtifacts } from './artifacts.mjs';

export { validateArtifactItems } from './artifacts.mjs';

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

export function prepare(args = process.argv.slice(2)) {
  const [platform, destination, mode] = args;
  if (!['android', 'ios'].includes(platform) || !destination)
    throw Error('Invalid target');
  if (mode === '--artifacts') {
    let freeGiB = null;
    try {
      const disk = statfsSync(process.env.RUNNER_TEMP);
      freeGiB = (Number(disk.bavail) * Number(disk.bsize)) / 2 ** 30;
    } catch {
      /* Missing disk metadata never suppresses bounded failure evidence. */
    }
    if (!collectArtifacts(platform, destination, { freeGiB }))
      process.exitCode = 1;
    return;
  }
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
  mkdirSync(resolve(destination, 'test'), { recursive: true });
  copyFileSync(
    resolve(fixture, 'test/main_test.dart'),
    resolve(destination, 'test/main_test.dart')
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
