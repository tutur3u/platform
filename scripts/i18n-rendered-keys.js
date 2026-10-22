#!/usr/bin/env bun
const fs = require('node:fs');
const path = require('node:path');
const { collectRenderedFiles } = require('./i18n-rendered-imports');
const {
  findFirstArgumentEnd,
  splitTopLevelTernary,
} = require('./i18n-source-key-scan');

// These framework-independent children receive translators from the traced wrappers.
const FORWARDED_TRANSLATORS = {
  'packages/satellite/src/components/apps-launcher-core.tsx':
    'command_launcher',
  'packages/ui/src/components/ui/custom/satellite-account-switcher-menu.tsx':
    'account_switcher',
  'packages/ui/src/components/ui/custom/satellite-onboarding-settings-panel.tsx':
    'onboarding_guide',
  'packages/ui/src/components/ui/custom/satellite-settings-dialog-shell.tsx':
    '',
  'packages/ui/src/components/ui/custom/satellite-theme-dropdown-items.tsx':
    'common',
  'packages/ui/src/components/ui/custom/satellite-user-menu-items.tsx': '',
  'packages/ui/src/components/ui/report-problem-dialog-content.tsx': 'common',
  'packages/ui/src/components/ui/use-report-problem.ts': 'common',
};

function flatten(value, prefix = '', output = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object') flatten(child, fullKey, output);
    else output.set(fullKey, child);
  }
  return output;
}

function collectRequirements(root, files, canonical) {
  const requirements = new Map();
  function add(key, file) {
    if (!requirements.has(key)) requirements.set(key, new Set());
    requirements.get(key).add(file);
  }
  function expand(pattern, file) {
    const regex = new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`
    );
    const keys = [...canonical.keys()].filter((key) => regex.test(key));
    if (!keys.length)
      throw new Error(`No canonical keys match ${pattern} in ${file}`);
    for (const key of keys) add(key, file);
  }
  for (const absolute of files) {
    const file = path.relative(root, absolute).split(path.sep).join('/');
    const content = fs.readFileSync(absolute, 'utf8');
    const translators = new Map();
    const declarations =
      /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s*)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([^'"]+)\2|\{[^}]*namespace\s*:\s*(['"])([^'"]+)\4[^}]*\})?\s*\)/g;
    for (const match of content.matchAll(declarations)) {
      const namespace = match[3] ?? match[5] ?? '';
      if (translators.has(match[1]) && translators.get(match[1]) !== namespace)
        throw new Error(
          `Conflicting translator namespaces for ${match[1]} in ${file}`
        );
      translators.set(match[1], namespace);
    }
    if (Object.hasOwn(FORWARDED_TRANSLATORS, file))
      translators.set('t', FORWARDED_TRANSLATORS[file]);
    for (const [variable, namespace] of translators) {
      const calls = new RegExp(
        `\\b${variable}(?:\\.(?:rich|raw|markup|has))?\\(\\s*`,
        'g'
      );
      const qualify = (key) => (namespace ? `${namespace}.${key}` : key);
      function collect(arg) {
        const literal = /^(['"])(.*?)\1(?:\s+as\b[\s\S]*)?$/.exec(arg);
        if (literal) {
          add(qualify(literal[2]), file);
          return;
        }
        if (arg.startsWith('`') && arg.endsWith('`')) {
          expand(qualify(arg.slice(1, -1).replace(/\$\{[^}]+\}/g, '*')), file);
          return;
        }
        const ternary = splitTopLevelTernary(arg);
        if (ternary) {
          collect(ternary.consequent.trim());
          collect(ternary.alternate.trim());
          return;
        }
        const property = /^\w+\.(\w+)$/.exec(arg);
        if (property) {
          const values = [
            ...content.matchAll(
              new RegExp(`\\b${property[1]}:\\s*['"]([^'"]+)['"]`, 'g')
            ),
          ];
          if (values.length) {
            for (const value of values) add(qualify(value[1]), file);
            return;
          }
        }
        // AppsLauncherDialog forwards the same translator to AppsLauncherCoreDialog.
        if (
          file === 'packages/satellite/src/components/apps-launcher.tsx' &&
          arg === 'key as never'
        )
          return;
        throw new Error(
          `Unresolved translation expression ${arg} in ${file}; trace its finite values before extending coverage`
        );
      }
      for (const call of content.matchAll(calls)) {
        const start = call.index + call[0].length;
        collect(
          content
            .slice(start, findFirstArgumentEnd(content, start, content.length))
            .trim()
        );
      }
    }
  }
  return requirements;
}

function auditApp({ root, app, scanImports }) {
  const files = collectRenderedFiles(root, app, scanImports);
  const canonical = flatten(
    JSON.parse(
      fs.readFileSync(path.join(root, 'apps/web/messages/en.json'), 'utf8')
    )
  );
  const required = collectRequirements(root, files, canonical);
  const missing = [];
  for (const locale of ['en', 'vi']) {
    const messages = flatten(
      JSON.parse(
        fs.readFileSync(
          path.join(root, app, 'messages', `${locale}.json`),
          'utf8'
        )
      )
    );
    for (const [key, sources] of required) {
      if (typeof messages.get(key) !== 'string')
        missing.push({ locale, key, sources: [...sources] });
    }
  }
  return { files, required, missing };
}

function main() {
  const root = process.cwd();
  const ts = new Bun.Transpiler({ loader: 'ts' });
  const tsx = new Bun.Transpiler({ loader: 'tsx' });
  const app = process.argv[2] ?? 'apps/mind';
  const result = auditApp({
    root,
    app,
    scanImports: (source, file) =>
      (file.endsWith('.tsx') || file.endsWith('.jsx') ? tsx : ts).scanImports(
        source
      ),
  });
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          app,
          files: result.files.map((file) => path.relative(root, file)),
          required: Object.fromEntries(
            [...result.required].map(([key, files]) => [key, [...files]])
          ),
          missing: result.missing,
        },
        null,
        2
      )
    );
    if (result.missing.length) process.exitCode = 1;
    return;
  }
  console.log(
    `${app}: ${result.files.length} reachable modules, ${result.required.size} required translation keys (en + vi)`
  );
  for (const { locale, key, sources } of result.missing)
    console.error(`${app} (${locale}): MISSING ${key} (${sources.join(', ')})`);
  if (result.missing.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { auditApp, collectRequirements, flatten };
