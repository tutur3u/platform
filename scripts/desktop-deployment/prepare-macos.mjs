import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function prepareMacos(mobileRoot) {
  const configurations = {};
  for (const flavor of ['development', 'staging', 'production']) {
    const fileOutput = `macos/Runner/GoogleService-Info-${flavor}.plist`;
    const contents = await readFile(join(mobileRoot, fileOutput), 'utf8');
    const field = (key) =>
      contents.match(
        new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`)
      )?.[1];
    const appId = field('GOOGLE_APP_ID');
    const projectId = field('PROJECT_ID');
    if (!appId || projectId !== 'tuturuuu-mobile')
      throw new Error('Invalid macOS Firebase identity');
    for (const mode of ['Debug', 'Profile', 'Release']) {
      configurations[`${mode}-${flavor}`] = {
        appId,
        projectId,
        fileOutput,
        uploadDebugSymbols: flavor === 'production',
      };
    }
  }
  const metadataPath = join(mobileRoot, 'firebase.json');
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  metadata.flutter ??= {};
  metadata.flutter.platforms ??= {};
  metadata.flutter.platforms.macos = { buildConfigurations: configurations };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
  // Xcode's resource phase requires this input before its flavor copy phase.
  await copyFile(
    join(mobileRoot, 'macos/Runner/GoogleService-Info-production.plist'),
    join(mobileRoot, 'macos/Runner/GoogleService-Info.plist')
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await prepareMacos(resolve(process.argv[2] ?? 'apps/mobile'));
}
