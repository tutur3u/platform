#!/usr/bin/env node

/**
 * i18n Translation Key Adder
 *
 * Adds one nested key to a selected app translation setup, every setup, or an
 * explicit messages directory. The script detects locale JSON files in each
 * target and requires one value per locale.
 *
 * Usage:
 *   node scripts/i18n-add-key.js --app web --key common.save --value en=Save --value vi=Lưu
 *   node scripts/i18n-add-key.js --dir apps/web/messages --key common.save --value en=Save --value vi=Lưu
 *   node scripts/i18n-add-key.js --all --key common.save --value en=Save --value vi=Lưu
 */

const path = require('node:path');
const {
  discoverTranslationDirs,
  getLocaleFromFile,
  getNestedValue,
  getProjectRoot,
  listJsonFiles,
  normalizeRelativePath,
  parseJsonFile,
  parseKeyPath,
  resolveAppMessagesDir,
  resolveTranslationDir,
  setNestedValue,
  writeSortedJsonFile,
} = require('./i18n-common');

function usage() {
  return `Usage:
  node scripts/i18n-add-key.js --app <app> --key <path> --value <locale>=<text>...
  node scripts/i18n-add-key.js --dir <messages-dir> --key <path> --value <locale>=<text>...
  node scripts/i18n-add-key.js --all --key <path> --value <locale>=<text>...

Options:
  --app <name>        Target apps/<name>/messages.
  --dir <path>        Target a specific messages directory.
  --all               Target every discovered apps/*/messages setup.
  --key <path>        Dot-separated nested key to add.
  --value <l>=<text>  Locale value. Repeat once per locale file.
  --overwrite         Replace an existing key instead of failing.
  --help              Show this help text.`;
}

function takeOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

function parseLocaleValue(rawValue) {
  const separatorIndex = rawValue.indexOf('=');

  if (separatorIndex <= 0) {
    throw new Error(
      `Invalid --value "${rawValue}". Use the form <locale>=<text>.`
    );
  }

  const locale = rawValue.slice(0, separatorIndex);
  const value = rawValue.slice(separatorIndex + 1);

  if (locale.trim() === '') {
    throw new Error(`Invalid --value "${rawValue}": locale is required.`);
  }

  return { locale, value };
}

function parseArgs(argv) {
  const options = {
    all: false,
    app: null,
    dir: null,
    help: false,
    key: null,
    overwrite: false,
    values: new Map(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--all') {
      options.all = true;
      continue;
    }

    if (arg === '--overwrite') {
      options.overwrite = true;
      continue;
    }

    if (arg === '--app') {
      options.app = takeOptionValue(argv, index, '--app');
      index += 1;
      continue;
    }

    if (arg.startsWith('--app=')) {
      options.app = arg.slice('--app='.length);
      continue;
    }

    if (arg === '--dir') {
      options.dir = takeOptionValue(argv, index, '--dir');
      index += 1;
      continue;
    }

    if (arg.startsWith('--dir=')) {
      options.dir = arg.slice('--dir='.length);
      continue;
    }

    if (arg === '--key') {
      options.key = takeOptionValue(argv, index, '--key');
      index += 1;
      continue;
    }

    if (arg.startsWith('--key=')) {
      options.key = arg.slice('--key='.length);
      continue;
    }

    if (arg === '--value') {
      const { locale, value } = parseLocaleValue(
        takeOptionValue(argv, index, '--value')
      );
      options.values.set(locale, value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--value=')) {
      const { locale, value } = parseLocaleValue(arg.slice('--value='.length));
      options.values.set(locale, value);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function resolveTargetDirs(options, projectRoot) {
  const targetModeCount = [options.all, options.app, options.dir].filter(
    Boolean
  ).length;

  if (targetModeCount !== 1) {
    throw new Error('Choose exactly one target mode: --app, --dir, or --all.');
  }

  if (options.all) {
    const dirs = discoverTranslationDirs(projectRoot);
    if (dirs.length === 0) {
      throw new Error('No apps/*/messages translation directories found.');
    }
    return dirs;
  }

  const absoluteDir = options.app
    ? resolveAppMessagesDir(projectRoot, options.app)
    : resolveTranslationDir(projectRoot, options.dir);

  if (listJsonFiles(absoluteDir).length === 0) {
    const label = options.app ? `apps/${options.app}/messages` : options.dir;
    throw new Error(`No locale JSON files found in ${label}.`);
  }

  return [normalizeRelativePath(projectRoot, absoluteDir)];
}

function collectTargetFiles(projectRoot, targetDirs) {
  return targetDirs.map((dir) => {
    const absoluteDir = path.join(projectRoot, dir);
    const files = listJsonFiles(absoluteDir);

    return {
      absoluteDir,
      dir,
      files: files.map((filePath) => ({
        filePath,
        locale: getLocaleFromFile(filePath),
      })),
    };
  });
}

function validateValuesForTargets(targets, values) {
  const usedLocales = new Set();
  const missingValues = [];

  for (const target of targets) {
    for (const { locale } of target.files) {
      usedLocales.add(locale);

      if (!values.has(locale)) {
        missingValues.push(`${target.dir}/${locale}.json`);
      }
    }
  }

  const unusedValues = [...values.keys()].filter(
    (locale) => !usedLocales.has(locale)
  );

  if (missingValues.length > 0) {
    throw new Error(
      `Missing --value entries for detected locale files:\n${missingValues
        .map((file) => `  - ${file}`)
        .join('\n')}`
    );
  }

  if (unusedValues.length > 0) {
    throw new Error(
      `Unused --value locale(s): ${unusedValues
        .sort((left, right) => left.localeCompare(right))
        .join(', ')}`
    );
  }
}

function executeAddKey({
  argv,
  projectRoot = getProjectRoot(),
  stdout,
  stderr,
}) {
  const out = stdout ?? process.stdout;
  const err = stderr ?? process.stderr;
  const options = parseArgs(argv);

  if (options.help) {
    out.write(`${usage()}\n`);
    return { code: 0, changedFiles: [], targets: [] };
  }

  if (!options.key) {
    throw new Error('--key is required.');
  }

  if (options.values.size === 0) {
    throw new Error('At least one --value <locale>=<text> entry is required.');
  }

  const keyParts = parseKeyPath(options.key);
  const targetDirs = resolveTargetDirs(options, projectRoot);
  const targets = collectTargetFiles(projectRoot, targetDirs);

  validateValuesForTargets(targets, options.values);

  const plannedWrites = [];
  const existingKeys = [];

  for (const target of targets) {
    for (const { filePath, locale } of target.files) {
      const content = parseJsonFile(filePath);
      const existingValue = getNestedValue(content, keyParts);

      if (existingValue !== undefined && !options.overwrite) {
        existingKeys.push(normalizeRelativePath(projectRoot, filePath));
        continue;
      }

      setNestedValue(content, keyParts, options.values.get(locale));
      plannedWrites.push({ content, filePath });
    }
  }

  if (existingKeys.length > 0) {
    throw new Error(
      `Translation key "${options.key}" already exists in:\n${existingKeys
        .map((file) => `  - ${file}`)
        .join('\n')}\nPass --overwrite to replace existing values.`
    );
  }

  const changedFiles = [];
  for (const { content, filePath } of plannedWrites) {
    writeSortedJsonFile(filePath, content);
    changedFiles.push(normalizeRelativePath(projectRoot, filePath));
  }

  out.write(
    `Added "${options.key}" to ${changedFiles.length} locale file(s) across ${targets.length} translation setup(s).\n`
  );

  for (const file of changedFiles) {
    out.write(`  - ${file}\n`);
  }

  if (err.isTTY) {
    err.write('');
  }

  return { code: 0, changedFiles, targets: targetDirs };
}

function main() {
  try {
    executeAddKey({ argv: process.argv.slice(2) });
  } catch (error) {
    process.stderr.write(`Error: ${error.message}\n\n${usage()}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  executeAddKey,
  parseArgs,
  parseLocaleValue,
  resolveTargetDirs,
  usage,
};
