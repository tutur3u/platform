#!/usr/bin/env bun

const fs = require('node:fs');
const path = require('node:path');
const { collectRenderedFiles } = require('./i18n-rendered-imports');
const { collectRequirements, flatten } = require('./i18n-rendered-keys');
const { PAUSED_APP_DIRECTORIES } = require('./paused-runtimes');

const ui = 'packages/ui/src/components/ui/';
const satellite = 'packages/satellite/src/components/';

// These components receive a scoped translator from their shared parent.
const forwardedTranslators = {
  [`${satellite}account-settings/account-settings-navigation.ts`]: '',
  [`${satellite}workspace-settings/navigation.tsx`]: '',
  [`${ui}calendar-app/components/calendar-connections-settings-content.tsx`]:
    'calendar',
  [`${ui}calendar-app/components/calendar-sync-settings-panel.tsx`]: 'calendar',
  [`${ui}custom/use-settings-dialog-navigation.ts`]: '',
  [`${ui}custom/workspace-access/workspace-access-labels.ts`]: '',
  [`${ui}custom/workspace-access/workspace-access-role-editor-labels.ts`]: '',
  [`${ui}custom/workspace-picker/picker-list.tsx`]: 'common',
  [`${ui}custom/workspace-picker/picker-section.tsx`]: 'common',
  [`${ui}custom/workspace-picker/row-actions.tsx`]: 'common',
  [`${ui}custom/workspace-picker/workspace-row.tsx`]: 'common',
};

function isSharedSettingsSource(file) {
  return /^packages\/(?:ui|satellite)\/.+(?:settings|workspace)/i.test(file);
}

function catalog(root, app, locale) {
  return JSON.parse(
    fs.readFileSync(path.join(root, 'apps', app, 'messages', `${locale}.json`))
  );
}

function settingsSurfaces(app) {
  if (app === 'colab')
    return [{ name: 'shell', entryDirs: ['src/client'], flat: true }];

  if (app === 'web' || app === 'workspace') {
    const prefix = 'src/app/[locale]';
    const surfaces = [
      { name: 'dashboard', entryDirs: [`${prefix}/(dashboard)`] },
      {
        name: 'root',
        entryDirs: [],
        entryFiles: [`${prefix}/layout.tsx`],
        messageLists: ['ROOT_CLIENT_MESSAGE_PATHS'],
      },
      {
        name: 'auth',
        entryDirs: [`${prefix}/(auth)`],
        messageLists: ['AUTH_CLIENT_MESSAGE_NAMESPACES'],
      },
    ];
    if (app === 'web') {
      surfaces.push(
        {
          name: 'marketing',
          entryDirs: [`${prefix}/(marketing)`],
          messageLists: [
            'ROOT_CLIENT_MESSAGE_NAMESPACES',
            'MARKETING_CLIENT_MESSAGE_NAMESPACES',
          ],
        },
        {
          name: 'ui',
          entryDirs: [`${prefix}/ui`],
          messageLists: ['UI_CLIENT_MESSAGE_NAMESPACES'],
        }
      );
    }
    return surfaces;
  }

  if (app === 'marketing')
    return [
      {
        name: 'marketing',
        entryDirs: ['src/app'],
        marketingPaths: true,
      },
    ];

  return [
    { name: 'dashboard', entryDirs: ['src/app', 'src/runtime', 'src/native'] },
  ];
}

function clientMessages(root, app, locale, surface) {
  const messages = catalog(root, app, locale);
  if (surface.flat) return new Map(Object.entries(messages.shell));

  if (surface.messageLists || surface.marketingPaths) {
    const client = require(
      path.join(root, 'apps', app, 'src/i18n/client-messages.ts')
    );
    const paths = surface.marketingPaths
      ? require(
          path.join(root, 'apps', app, 'src/lib/marketing-render-context.ts')
        ).getMarketingMessagePaths()
      : surface.messageLists.flatMap((name) => client[name]);
    return flatten(client.getClientMessages(messages, paths));
  }

  return flatten(messages);
}

function auditSettings(root, names) {
  const apps = names.length
    ? names
    : fs
        .readdirSync(path.join(root, 'apps'))
        .filter(
          (app) =>
            !PAUSED_APP_DIRECTORIES.has(app) &&
            fs.existsSync(path.join(root, 'apps', app, 'messages/en.json'))
        );
  const ts = new Bun.Transpiler({ loader: 'ts' });
  const tsx = new Bun.Transpiler({ loader: 'tsx' });
  const imports = new Map();
  const requirements = new Map();
  const canonical = flatten(catalog(root, 'web', 'en'));

  function scanImports(source, file) {
    if (!imports.has(file)) {
      const parser = file.endsWith('.tsx') ? tsx : ts;
      imports.set(file, parser.scanImports(source));
    }
    return imports.get(file);
  }

  return apps.flatMap((app) =>
    settingsSurfaces(app).map((surface) => {
      const unresolved = new Set();
      const files = collectRenderedFiles(root, `apps/${app}`, scanImports, {
        entryDirs: surface.entryDirs,
        entryFiles: surface.entryFiles,
        onUnresolvedImport(specifier, from) {
          if (
            /settings|workspace/.test(specifier) ||
            isSharedSettingsSource(path.relative(root, from))
          )
            unresolved.add(`${specifier} from ${path.relative(root, from)}`);
        },
      }).filter((file) => isSharedSettingsSource(path.relative(root, file)));

      const keys = new Map();
      for (const file of files) {
        if (!requirements.has(file)) {
          requirements.set(
            file,
            collectRequirements(root, [file], canonical, {
              forwardedTranslators,
              requireTranslatorBindings: true,
            })
          );
        }
        for (const [key, sources] of requirements.get(file)) {
          if (!keys.has(key)) keys.set(key, new Set());
          for (const source of sources) keys.get(key).add(source);
        }
      }

      const missing = [];
      for (const locale of ['en', 'vi']) {
        if (keys.size === 0) continue;
        const messages = clientMessages(root, app, locale, surface);
        for (const [key, sources] of keys) {
          const value = messages.get(key);
          if (typeof value !== 'string' || !value.trim() || value === key)
            missing.push({ locale, key, sources: [...sources] });
        }
      }

      return {
        app,
        surface: surface.name,
        sharedFiles: files.length,
        requiredKeys: keys.size,
        missing,
        unresolved: [...unresolved].sort(),
      };
    })
  );
}

function main(argv = process.argv.slice(2)) {
  const result = auditSettings(
    process.cwd(),
    argv.filter((arg) => arg !== '--json')
  );
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const { app, surface, requiredKeys, missing, unresolved } of result) {
      console.log(
        `${app}/${surface}: ${requiredKeys} shared settings keys (en + vi)`
      );
      for (const issue of missing)
        console.error(
          `  ${issue.locale}: MISSING ${issue.key} (${issue.sources.join(', ')})`
        );
      for (const issue of unresolved) console.error(`  UNTRACED ${issue}`);
    }
  }
  if (
    result.some(
      ({ missing, unresolved }) => missing.length || unresolved.length
    )
  )
    process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { auditSettings };
