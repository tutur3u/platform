#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PLURAL_SUFFIXES = [
  '_zero',
  '_one',
  '_two',
  '_few',
  '_many',
  '_other',
  '_interval',
];

function collectValues(argv, startIndex, target) {
  let index = startIndex;
  while (index < argv.length && !argv[index].startsWith('-')) {
    target.push(argv[index]);
    index += 1;
  }

  return index - 1;
}

function parseArgs(argv) {
  const options = {
    format: undefined,
    ignore: [],
    locales: [],
    only: ['missingKeys', 'invalidKeys'],
    source: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-l' || arg === '--locales') {
      index = collectValues(argv, index + 1, options.locales);
      continue;
    }

    if (arg === '-s' || arg === '--source') {
      options.source = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '-f' || arg === '--format') {
      options.format = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '-o' || arg === '--only' || arg === '-c' || arg === '--check') {
      options.only = [];
      index = collectValues(argv, index + 1, options.only);
      continue;
    }

    if (arg === '-i' || arg === '--ignore') {
      index = collectValues(argv, index + 1, options.ignore);
    }
  }

  return options;
}

function findTranslationFiles(projectRoot, locales) {
  const files = [];

  for (const localePath of locales) {
    const absolutePath = path.resolve(projectRoot, localePath);
    walkFiles(absolutePath, files);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function walkFiles(currentPath, files) {
  if (!fs.existsSync(currentPath)) {
    return;
  }

  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
}

function flattenTranslations(translations, keys = [], result = {}) {
  if (
    translations == null ||
    typeof translations !== 'object' ||
    Array.isArray(translations)
  ) {
    if (keys.length > 0) {
      result[keys.join('.')] = translations;
    }
    return result;
  }

  for (const [key, value] of Object.entries(translations)) {
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      flattenTranslations(value, [...keys, key], result);
      continue;
    }

    result[[...keys, key].join('.')] = value;
  }

  return result;
}

function buildFileInfo(projectRoot, file) {
  const relativeFile = path.relative(projectRoot, file);
  const dirPath = path.dirname(relativeFile);
  const name = path.basename(relativeFile);
  const extension = path.extname(name).slice(1) || 'json';

  return {
    extension,
    file,
    name,
    pathParts: dirPath === '.' ? [] : dirPath.split(path.sep),
    relativeFile,
  };
}

function isSourceFile(fileInfo, sourceLocale) {
  const source = sourceLocale.toLowerCase();
  const basename = path
    .basename(fileInfo.name, path.extname(fileInfo.name))
    .toLowerCase();

  return (
    basename === source ||
    fileInfo.pathParts.some((part) => part.toLowerCase() === source)
  );
}

function loadFileContent(file) {
  return flattenTranslations(JSON.parse(fs.readFileSync(file, 'utf8')));
}

function matchesIgnoredKey(key, ignoredPatterns) {
  return ignoredPatterns.some((pattern) => {
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return key === prefix || key.startsWith(`${prefix}.`);
    }

    return key === pattern;
  });
}

function normalizeI18nextKey(key) {
  const suffix = PLURAL_SUFFIXES.find((pluralSuffix) =>
    key.endsWith(pluralSuffix)
  );
  return suffix ? key.slice(0, -suffix.length) : key;
}

function findMissingKeys(sourceContent, targetContent, ignore) {
  const missing = [];
  const normalizedTarget = new Set(
    Object.keys(targetContent).map((key) => normalizeI18nextKey(key))
  );

  for (const sourceKey of Object.keys(sourceContent)) {
    const normalizedKey = normalizeI18nextKey(sourceKey);
    if (matchesIgnoredKey(normalizedKey, ignore)) {
      continue;
    }

    if (!normalizedTarget.has(normalizedKey)) {
      missing.push(normalizedKey);
    }
  }

  return [...new Set(missing)].sort((a, b) => a.localeCompare(b));
}

function tokenizeI18next(value) {
  if (typeof value !== 'string') {
    return [{ type: typeof value, value: String(value) }];
  }

  const tokens = [];
  const interpolationRegex = /\{\{(-)?\s*([^{}]+?)\s*\}\}/g;
  const nestingRegex = /\$t\(\s*([^)]+?)\s*\)/g;
  const tagRegex = /<\/?([A-Za-z0-9:_-]+)(\s*\/)?>/g;

  for (const match of value.matchAll(interpolationRegex)) {
    tokens.push({
      type: match[1] ? 'interpolation_unescaped' : 'interpolation',
      value: match[2].trim(),
    });
  }

  for (const match of value.matchAll(nestingRegex)) {
    tokens.push({
      type: 'nesting',
      value: match[1].trim(),
    });
  }

  for (const match of value.matchAll(tagRegex)) {
    const raw = match[0].replace(/\s+/g, '');
    tokens.push({
      type: 'tag',
      value: raw,
    });
  }

  return tokens.sort((left, right) => {
    const leftKey = `${left.type}:${left.value}`;
    const rightKey = `${right.type}:${right.value}`;
    return leftKey.localeCompare(rightKey);
  });
}

function findInvalidKeys(sourceContent, targetContent, ignore) {
  const invalid = [];

  for (const [key, sourceValue] of Object.entries(sourceContent)) {
    const normalizedKey = normalizeI18nextKey(key);
    if (matchesIgnoredKey(normalizedKey, ignore)) {
      continue;
    }

    if (!(key in targetContent)) {
      continue;
    }

    const targetValue = targetContent[key];
    const sourceType =
      sourceValue === null
        ? 'null'
        : Array.isArray(sourceValue)
          ? 'array'
          : typeof sourceValue;
    const targetType =
      targetValue === null
        ? 'null'
        : Array.isArray(targetValue)
          ? 'array'
          : typeof targetValue;

    if (sourceType !== targetType) {
      invalid.push({
        key,
        message: `Expected type "${sourceType}" but received "${targetType}"`,
      });
      continue;
    }

    if (sourceType !== 'string') {
      invalid.push({
        key,
        message: `Expected a non-null string translation but received "${sourceType}"`,
      });
      continue;
    }

    const sourceTokens = tokenizeI18next(sourceValue);
    const targetTokens = tokenizeI18next(targetValue);

    if (JSON.stringify(sourceTokens) !== JSON.stringify(targetTokens)) {
      invalid.push({
        key,
        message:
          'Interpolation or markup tokens differ from the source translation',
      });
    }
  }

  return invalid.sort((left, right) => left.key.localeCompare(right.key));
}

function createLogBuffer() {
  const lines = [];

  return {
    lines,
    write(...parts) {
      lines.push(parts.join(''));
    },
  };
}

function runFallbackCheck({
  argv,
  projectRoot,
  stdout = console.log,
  stderr = console.error,
  now = Date.now,
}) {
  const startedAt = now();
  const options = parseArgs(argv);

  if (!options.source) {
    stderr(
      'Source not found. Please provide a valid source locale, i.e. -s en'
    );
    return 1;
  }

  if (options.locales.length === 0) {
    stderr(
      'Locale file(s) not found. Please provide valid locale file(s), i.e. -l apps/web/messages'
    );
    return 1;
  }

  stdout('i18n translations checker');
  stdout(`Source: ${options.source}`);
  if (options.format) {
    stdout(`Selected format is: ${options.format}`);
  }
  stdout('');

  const fileInfos = findTranslationFiles(projectRoot, options.locales).map(
    (file) => buildFileInfo(projectRoot, file)
  );
  const sourceFiles = [];
  const targetFiles = [];

  for (const fileInfo of fileInfos) {
    const content = loadFileContent(fileInfo.file);
    if (isSourceFile(fileInfo, options.source)) {
      sourceFiles.push({ ...fileInfo, content });
      continue;
    }

    const reference = sourceFiles.find((sourceFile) => {
      if (sourceFile.pathParts.join('-') === fileInfo.pathParts.join('-')) {
        return true;
      }

      return (
        sourceFile.pathParts.slice(0, -1).join('-') ===
          fileInfo.pathParts.slice(0, -1).join('-') &&
        sourceFile.name === fileInfo.name
      );
    });

    if (reference) {
      targetFiles.push({ ...fileInfo, content, reference });
    }
  }

  if (sourceFiles.length === 0) {
    stderr(
      'Source not found. Please provide a valid source locale, i.e. -s en'
    );
    return 1;
  }

  const only = new Set(options.only);
  const missingByFile = new Map();
  const invalidByFile = new Map();

  for (const targetFile of targetFiles) {
    if (only.has('missingKeys')) {
      const missingKeys = findMissingKeys(
        targetFile.reference.content,
        targetFile.content,
        options.ignore
      );
      if (missingKeys.length > 0) {
        missingByFile.set(targetFile.relativeFile, missingKeys);
      }
    }

    if (only.has('invalidKeys')) {
      const invalidKeys = findInvalidKeys(
        targetFile.reference.content,
        targetFile.content,
        options.ignore
      );
      if (invalidKeys.length > 0) {
        invalidByFile.set(targetFile.relativeFile, invalidKeys);
      }
    }
  }

  if (missingByFile.size === 0) {
    stdout('No missing keys found!');
  } else {
    stdout('Found missing keys!');
    for (const [file, keys] of missingByFile.entries()) {
      stdout(`\n${file}`);
      for (const key of keys) {
        stdout(`- ${key}`);
      }
    }
  }

  stdout('');

  if (invalidByFile.size === 0) {
    stdout('No invalid translations found!');
  } else {
    stdout('Found invalid translations!');
    for (const [file, entries] of invalidByFile.entries()) {
      stdout(`\n${file}`);
      for (const entry of entries) {
        stdout(`- ${entry.key}: ${entry.message}`);
      }
    }
  }

  const duration = ((now() - startedAt) / 1000).toFixed(2);
  stdout(`\nDone in ${duration}s.`);

  if (missingByFile.size > 0 || invalidByFile.size > 0) {
    return 1;
  }

  return 0;
}

function getPackageCliPath(projectRoot) {
  return path.join(
    projectRoot,
    'node_modules',
    '@lingual',
    'i18n-check',
    'dist',
    'bin',
    'index.js'
  );
}

function runCli(argv, projectRoot = path.resolve(__dirname, '..')) {
  const packageCliPath = getPackageCliPath(projectRoot);
  if (fs.existsSync(packageCliPath)) {
    const result = spawnSync(process.execPath, [packageCliPath, ...argv], {
      cwd: projectRoot,
      stdio: 'inherit',
    });

    return typeof result.status === 'number' ? result.status : 1;
  }

  return runFallbackCheck({
    argv,
    projectRoot,
  });
}

if (require.main === module) {
  process.exit(runCli(process.argv.slice(2)));
}

module.exports = {
  PLURAL_SUFFIXES,
  collectValues,
  createLogBuffer,
  findInvalidKeys,
  findMissingKeys,
  flattenTranslations,
  getPackageCliPath,
  isSourceFile,
  matchesIgnoredKey,
  normalizeI18nextKey,
  parseArgs,
  runCli,
  runFallbackCheck,
  tokenizeI18next,
};
