import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [platform, destination] = process.argv.slice(2);
if (!['android', 'ios'].includes(platform) || !destination)
  throw Error('Invalid target');
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
  { stdio: 'inherit' }
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
copyFileSync(journal, resolve(destination, 'lib/inventory_sale_journal.dart'));
const digest = createHash('sha256').update(readFileSync(journal)).digest('hex');
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
  const project = resolve(destination, 'ios/Runner.xcodeproj/project.pbxproj');
  writeFileSync(
    project,
    readFileSync(project, 'utf8').replace(
      /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g,
      (_, original) =>
        'PRODUCT_BUNDLE_IDENTIFIER = dev.tuturuuu.fixture.sale_journal_fixture' +
        (original.includes('RunnerTests') ? '.RunnerTests' : '') +
        ';'
    )
  );
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
