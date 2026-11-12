const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = process.cwd();

/**
 * Read the shared launcher registry without loading TypeScript in this Node
 * validation script. Every message bundle that ships the shared command
 * launcher must provide a localized name and description for every registered
 * app because those translation keys are resolved dynamically at runtime.
 */
function getLaunchableAppSlugs() {
  const registryPath = path.join(
    ROOT_DIR,
    'packages',
    'utils',
    'src',
    'launchable-apps.ts'
  );
  if (!fs.existsSync(registryPath)) return [];

  const source = fs.readFileSync(registryPath, 'utf-8');
  const registryStart = source.indexOf('export const LAUNCHABLE_APPS = [');
  if (registryStart === -1) return [];

  const registrySource = source.slice(registryStart);
  const slugs = new Set();
  const slugRegex = /^\s+slug:\s*'([^']+)'/gmu;
  let match = slugRegex.exec(registrySource);

  while (match !== null) {
    slugs.add(match[1]);
    match = slugRegex.exec(registrySource);
  }

  return [...slugs].sort();
}

/**
 * Dynamic launcher keys cannot be discovered by the static source scanner.
 * Validate both locales for every app bundle that includes command_launcher so
 * a newly registered app can never render a raw app_names/app_descriptions key.
 */
function findLaunchableAppTranslationFailures() {
  const appsDir = path.join(ROOT_DIR, 'apps');
  const slugs = getLaunchableAppSlugs();
  if (!fs.existsSync(appsDir) || slugs.length === 0) return [];

  const failures = [];

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    for (const locale of ['en', 'vi']) {
      const messagesPath = path.join(
        appsDir,
        entry.name,
        'messages',
        `${locale}.json`
      );
      if (!fs.existsSync(messagesPath)) continue;

      const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
      const launcher = messages.command_launcher;
      if (!launcher) continue;

      const missing = [];
      for (const slug of slugs) {
        if (!launcher.app_names?.[slug]) {
          missing.push(`command_launcher.app_names.${slug}`);
        }
        if (!launcher.app_descriptions?.[slug]) {
          missing.push(`command_launcher.app_descriptions.${slug}`);
        }
      }

      if (missing.length > 0) {
        failures.push({
          appDir: `apps/${entry.name}`,
          locale,
          missing,
        });
      }
    }
  }

  return failures;
}

module.exports = { findLaunchableAppTranslationFailures };
