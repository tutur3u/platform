#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findNextConfig(appDir) {
  return ['next.config.ts', 'next.config.mjs', 'next.config.js']
    .map((name) => path.join(appDir, name))
    .find((filePath) => fs.existsSync(filePath));
}

function findSourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name === '.next'
        ? []
        : findSourceFiles(entryPath);
    }

    return /\.[cm]?[jt]sx?$/u.test(entry.name) ? [entryPath] : [];
  });
}

function discoverNextIntlApps(rootDir) {
  const appsDir = path.join(rootDir, 'apps');
  if (!fs.existsSync(appsDir)) return [];

  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      appDir: path.join(appsDir, entry.name),
      name: `apps/${entry.name}`,
    }))
    .filter(({ appDir }) => {
      const configPath = findNextConfig(appDir);
      return (
        configPath && /from\s+['"]next-intl\/plugin['"]/u.test(read(configPath))
      );
    });
}

function validateNextIntlApp({ appDir, name }) {
  const errors = [];
  const requestPath = path.join(appDir, 'src/i18n/request.ts');
  const routingPath = path.join(appDir, 'src/i18n/routing.ts');
  const localeLayoutPath = path.join(appDir, 'src/app/[locale]/layout.tsx');
  const hasLocaleRoot = fs.existsSync(localeLayoutPath);

  if (!fs.existsSync(requestPath)) {
    errors.push(`${name}: missing src/i18n/request.ts`);
    return errors;
  }
  if (!fs.existsSync(routingPath)) {
    errors.push(`${name}: missing src/i18n/routing.ts`);
    return errors;
  }

  const request = read(requestPath);
  const routing = read(routingPath);

  if (!request.includes('getRequestConfig')) {
    errors.push(`${name}: request config must use getRequestConfig`);
  }
  if (!request.includes('messages:')) {
    errors.push(`${name}: request config must return messages`);
  }
  if (!routing.includes('routing')) {
    errors.push(`${name}: routing module must export routing configuration`);
  }

  if (hasLocaleRoot) {
    const layout = read(localeLayoutPath);

    if (!request.includes('locale: localeOverride')) {
      errors.push(`${name}: locale-root request config must accept locale`);
    }
    if (!request.includes('resolveRequestLocale(')) {
      errors.push(
        `${name}: locale-root request config must resolve request locale with a default`
      );
    }
    if (!request.includes('requestLocale')) {
      errors.push(
        `${name}: locale-root request config must resolve requestLocale`
      );
    }
    if (request.includes('next/root-params')) {
      errors.push(
        `${name}: locale-root request config must not import next/root-params`
      );
    }
    if (!layout.includes('next/root-params')) {
      errors.push(`${name}: locale-root layout must import next/root-params`);
    }
    if (!layout.includes('resolveRootLocale(')) {
      errors.push(`${name}: locale-root layout must validate root locale`);
    }
    if (layout.includes('getLocale()')) {
      errors.push(
        `${name}: locale-root layout must not call getLocale at the prerender boundary`
      );
    }
    if (!/<html\b[^>]*\blang=\{locale\}/u.test(layout)) {
      errors.push(
        `${name}: locale-root layout must set html lang from validated root params`
      );
    }
  } else {
    if (!request.includes('requestLocale')) {
      errors.push(`${name}: unsegmented app must resolve requestLocale`);
    }
    if (request.includes('resolveRootLocale(')) {
      errors.push(`${name}: unsegmented app must not resolve root locale`);
    }
  }

  for (const sourcePath of findSourceFiles(path.join(appDir, 'src'))) {
    if (read(sourcePath).includes('setRequestLocale')) {
      errors.push(
        `${name}: legacy setRequestLocale found in ${path.relative(appDir, sourcePath)}`
      );
    }
  }

  return errors;
}

function checkNextIntlSetup(rootDir = process.cwd()) {
  const apps = discoverNextIntlApps(rootDir);
  const errors = apps.flatMap(validateNextIntlApp);
  return { apps, errors };
}

if (require.main === module) {
  const { apps, errors } = checkNextIntlSetup();

  if (errors.length > 0) {
    console.error('next-intl setup check failed:\n');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    const localeRootCount = apps.filter(({ appDir }) =>
      fs.existsSync(path.join(appDir, 'src/app/[locale]/layout.tsx'))
    ).length;
    console.log(
      `next-intl setup verified for ${apps.length} apps (${localeRootCount} locale-rooted).`
    );
  }
}

module.exports = {
  checkNextIntlSetup,
  discoverNextIntlApps,
  validateNextIntlApp,
};
