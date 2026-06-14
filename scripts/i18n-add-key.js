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
 *   node scripts/i18n-add-key.js --app web --mode remove --key common.old
 *   node scripts/i18n-add-key.js --all --mode add --entries '{"common.save":{"en":"Save","vi":"Lưu"}}'
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  deleteNestedValue,
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

const OPERATION_MODES = new Set(['add', 'remove', 'replace']);

function usage() {
  return `Usage:
  node scripts/i18n-add-key.js --app <app> --key <path> --value <locale>=<text>...
  node scripts/i18n-add-key.js --dir <messages-dir> --key <path> --value <locale>=<text>...
  node scripts/i18n-add-key.js --all --key <path> --value <locale>=<text>...
  node scripts/i18n-add-key.js --app <app> --mode remove --key <path>
  node scripts/i18n-add-key.js --all --mode add --entries '{"common.save":{"en":"Save","vi":"Lưu"}}'
  node scripts/i18n-add-key.js --app <app> --mode replace --entries-file ./translations.json

Options:
  --app <name>        Target apps/<name>/messages.
  --dir <path>        Target a specific messages directory.
  --all               Target every discovered apps/*/messages setup.
  --mode <mode>       Operation mode: add, remove, or replace. Default: add.
  --bulk-add          Alias for --mode add.
  --bulk-remove       Alias for --mode remove.
  --bulk-replace      Alias for --mode replace.
  --key <path>        Dot-separated nested key to add.
  --value <l>=<text>  Locale value. Repeat once per locale file.
  --entries <json>    Bulk entries. Add/replace use {"key":{"en":"..."}}.
                      Remove accepts ["key.one","key.two"].
  --entries-file <p>  Read bulk entries JSON from a file.
  --overwrite         Replace an existing key instead of failing.
  --ignore-missing    Skip missing keys in remove/replace mode.
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
    entries: null,
    entriesFile: null,
    help: false,
    ignoreMissing: false,
    key: null,
    mode: 'add',
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

    if (arg === '--ignore-missing') {
      options.ignoreMissing = true;
      continue;
    }

    if (arg === '--bulk-add') {
      options.mode = 'add';
      continue;
    }

    if (arg === '--bulk-remove') {
      options.mode = 'remove';
      continue;
    }

    if (arg === '--bulk-replace') {
      options.mode = 'replace';
      continue;
    }

    if (arg === '--mode') {
      options.mode = takeOptionValue(argv, index, '--mode');
      index += 1;
      continue;
    }

    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
      continue;
    }

    if (arg === '--entries') {
      options.entries = takeOptionValue(argv, index, '--entries');
      index += 1;
      continue;
    }

    if (arg.startsWith('--entries=')) {
      options.entries = arg.slice('--entries='.length);
      continue;
    }

    if (arg === '--entries-file') {
      options.entriesFile = takeOptionValue(argv, index, '--entries-file');
      index += 1;
      continue;
    }

    if (arg.startsWith('--entries-file=')) {
      options.entriesFile = arg.slice('--entries-file='.length);
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

  if (!OPERATION_MODES.has(options.mode)) {
    throw new Error(
      `Invalid --mode "${options.mode}". Use add, remove, or replace.`
    );
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

function validateValuesForTargets(targets, values, key) {
  const usedLocales = new Set();
  const missingValues = [];

  for (const target of targets) {
    for (const { locale } of target.files) {
      usedLocales.add(locale);

      if (!values.has(locale)) {
        missingValues.push(`${target.dir}/${locale}.json for ${key}`);
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

function parseEntriesJson(rawJson, sourceLabel) {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Invalid JSON in ${sourceLabel}: ${error.message}`);
  }
}

function loadRawEntries(options, projectRoot) {
  if (options.entries && options.entriesFile) {
    throw new Error('Use only one of --entries or --entries-file.');
  }

  if (options.entries) {
    return parseEntriesJson(options.entries, '--entries');
  }

  if (options.entriesFile) {
    const filePath = path.resolve(projectRoot, options.entriesFile);
    return parseEntriesJson(fs.readFileSync(filePath, 'utf8'), filePath);
  }

  return null;
}

function assertLocaleValuesObject(value, key) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Bulk entry "${key}" must be an object of locale values.`);
  }

  const values = new Map();
  for (const [locale, localeValue] of Object.entries(value)) {
    if (locale.trim() === '') {
      throw new Error(`Bulk entry "${key}" has an empty locale.`);
    }

    if (typeof localeValue !== 'string') {
      throw new Error(
        `Bulk entry "${key}" locale "${locale}" must be a string.`
      );
    }

    values.set(locale, localeValue);
  }

  if (values.size === 0) {
    throw new Error(`Bulk entry "${key}" must include at least one locale.`);
  }

  return values;
}

function normalizeBulkEntries(rawEntries, mode) {
  if (mode === 'remove') {
    if (Array.isArray(rawEntries)) {
      return rawEntries.map((entry) => {
        const key = typeof entry === 'string' ? entry : entry?.key;
        if (typeof key !== 'string') {
          throw new Error('Remove entries must be key strings or { "key" }.');
        }
        return { key, keyParts: parseKeyPath(key), values: new Map() };
      });
    }

    if (rawEntries !== null && typeof rawEntries === 'object') {
      return Object.keys(rawEntries).map((key) => ({
        key,
        keyParts: parseKeyPath(key),
        values: new Map(),
      }));
    }

    throw new Error('Remove bulk entries must be an array or object.');
  }

  if (Array.isArray(rawEntries)) {
    return rawEntries.map((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('Add/replace entries must be objects.');
      }

      const { key, values, ...localeValues } = entry;
      if (typeof key !== 'string') {
        throw new Error('Add/replace array entries require a string "key".');
      }

      return {
        key,
        keyParts: parseKeyPath(key),
        values: assertLocaleValuesObject(values ?? localeValues, key),
      };
    });
  }

  if (rawEntries !== null && typeof rawEntries === 'object') {
    return Object.entries(rawEntries).map(([key, values]) => ({
      key,
      keyParts: parseKeyPath(key),
      values: assertLocaleValuesObject(values, key),
    }));
  }

  throw new Error('Add/replace bulk entries must be an array or object.');
}

function normalizeOperations(options, projectRoot) {
  const rawEntries = loadRawEntries(options, projectRoot);

  if (rawEntries !== null) {
    if (options.key || options.values.size > 0) {
      throw new Error(
        'Do not combine --entries/--entries-file with --key or --value.'
      );
    }

    const operations = normalizeBulkEntries(rawEntries, options.mode);
    if (operations.length === 0) {
      throw new Error('Bulk entries must include at least one key.');
    }
    return operations;
  }

  if (!options.key) {
    throw new Error('--key is required when --entries is not provided.');
  }

  if (options.mode === 'remove') {
    if (options.values.size > 0) {
      throw new Error('Remove mode does not accept --value entries.');
    }

    return [
      {
        key: options.key,
        keyParts: parseKeyPath(options.key),
        values: new Map(),
      },
    ];
  }

  if (options.values.size === 0) {
    throw new Error('At least one --value <locale>=<text> entry is required.');
  }

  return [
    {
      key: options.key,
      keyParts: parseKeyPath(options.key),
      values: options.values,
    },
  ];
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

  const operations = normalizeOperations(options, projectRoot);
  const targetDirs = resolveTargetDirs(options, projectRoot);
  const targets = collectTargetFiles(projectRoot, targetDirs);

  if (options.mode !== 'remove') {
    for (const operation of operations) {
      validateValuesForTargets(targets, operation.values, operation.key);
    }
  }

  const plannedWrites = new Map();
  const sourceContents = new Map();
  const existingKeys = [];
  const missingKeys = [];

  for (const target of targets) {
    for (const { filePath, locale } of target.files) {
      let content = plannedWrites.get(filePath);
      if (!content) {
        content = parseJsonFile(filePath);
        plannedWrites.set(filePath, content);
        sourceContents.set(filePath, JSON.stringify(content));
      }

      for (const operation of operations) {
        const existingValue = getNestedValue(content, operation.keyParts);

        if (
          options.mode === 'add' &&
          existingValue !== undefined &&
          !options.overwrite
        ) {
          existingKeys.push(
            `${normalizeRelativePath(projectRoot, filePath)}:${operation.key}`
          );
          continue;
        }

        if (
          (options.mode === 'replace' || options.mode === 'remove') &&
          existingValue === undefined
        ) {
          if (!options.ignoreMissing) {
            missingKeys.push(
              `${normalizeRelativePath(projectRoot, filePath)}:${operation.key}`
            );
          }
          continue;
        }

        if (options.mode === 'remove') {
          deleteNestedValue(content, operation.keyParts);
          continue;
        }

        setNestedValue(
          content,
          operation.keyParts,
          operation.values.get(locale)
        );
      }
    }
  }

  if (existingKeys.length > 0) {
    throw new Error(
      `Translation key(s) already exist:\n${existingKeys
        .map((file) => `  - ${file}`)
        .join('\n')}\nPass --overwrite to replace existing values in add mode.`
    );
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `Translation key(s) are missing:\n${missingKeys
        .map((file) => `  - ${file}`)
        .join(
          '\n'
        )}\nPass --ignore-missing to skip missing keys in ${options.mode} mode.`
    );
  }

  const changedFiles = [];
  for (const [filePath, content] of plannedWrites.entries()) {
    if (sourceContents.get(filePath) === JSON.stringify(content)) {
      continue;
    }

    writeSortedJsonFile(filePath, content);
    changedFiles.push(normalizeRelativePath(projectRoot, filePath));
  }

  out.write(
    `${options.mode === 'add' ? 'Added' : options.mode === 'remove' ? 'Removed' : 'Replaced'} ${operations.length} translation key(s) in ${changedFiles.length} locale file(s) across ${targets.length} translation setup(s).\n`
  );

  for (const file of changedFiles) {
    out.write(`  - ${file}\n`);
  }

  if (err.isTTY) {
    err.write('');
  }

  return {
    changedFiles,
    code: 0,
    keys: operations.map((operation) => operation.key),
    mode: options.mode,
    targets: targetDirs,
  };
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
