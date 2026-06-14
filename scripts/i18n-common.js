const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_TRANSLATION_DIRS = [
  'apps/web/messages',
  'apps/apps/messages',
  'apps/calendar/messages',
  'apps/chat/messages',
  'apps/cms/messages',
  'apps/drive/messages',
  'apps/finance/messages',
  'apps/hive/messages',
  'apps/inventory/messages',
  'apps/mind/messages',
  'apps/nova/messages',
  'apps/qr/messages',
  'apps/rewise/messages',
  'apps/shortener/messages',
  'apps/tasks/messages',
  'apps/meet/messages',
  'apps/track/messages',
];

const UNSAFE_KEY_PARTS = new Set(['__proto__', 'constructor', 'prototype']);

function getProjectRoot() {
  return path.resolve(__dirname, '..');
}

function normalizeRelativePath(projectRoot, targetPath) {
  return path.relative(projectRoot, targetPath).split(path.sep).join('/');
}

function sortObjectKeysDeep(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const sorted = {};
  const sortedKeys = Object.keys(value).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );

  for (const key of sortedKeys) {
    sorted[key] = sortObjectKeysDeep(value[key]);
  }

  return sorted;
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function discoverTranslationDirs(projectRoot = getProjectRoot()) {
  const appsDir = path.join(projectRoot, 'apps');

  if (!fs.existsSync(appsDir)) {
    return [];
  }

  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(appsDir, entry.name, 'messages'))
    .filter((messagesDir) => listJsonFiles(messagesDir).length > 0)
    .map((messagesDir) => normalizeRelativePath(projectRoot, messagesDir))
    .sort((left, right) => left.localeCompare(right));
}

function getDefaultTranslationDirs(projectRoot = getProjectRoot()) {
  return DEFAULT_TRANSLATION_DIRS.filter((dir) =>
    fs.existsSync(path.join(projectRoot, dir))
  );
}

function resolveTranslationDir(projectRoot, dir) {
  return path.resolve(projectRoot, dir);
}

function resolveAppMessagesDir(projectRoot, appName) {
  const normalizedAppName = appName.replace(/^apps\//, '').replace(/\/$/, '');
  return path.join(projectRoot, 'apps', normalizedAppName, 'messages');
}

function getLocaleFromFile(filePath) {
  return path.basename(filePath, '.json');
}

function parseJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function formatJson(value) {
  return `${JSON.stringify(sortObjectKeysDeep(value), null, 2)}\n`;
}

function writeSortedJsonFile(filePath, value) {
  fs.writeFileSync(filePath, formatJson(value), 'utf8');
}

function parseKeyPath(keyPath) {
  if (typeof keyPath !== 'string' || keyPath.trim() === '') {
    throw new Error('Translation key is required.');
  }

  const parts = keyPath.split('.');

  if (parts.some((part) => part === '')) {
    throw new Error(`Invalid translation key "${keyPath}": empty key segment.`);
  }

  const unsafePart = parts.find((part) => UNSAFE_KEY_PARTS.has(part));
  if (unsafePart) {
    throw new Error(
      `Invalid translation key "${keyPath}": "${unsafePart}" is not allowed.`
    );
  }

  return parts;
}

function getNestedValue(obj, keyPath) {
  const parts = Array.isArray(keyPath) ? keyPath : parseKeyPath(keyPath);
  let current = obj;

  for (const part of parts) {
    if (
      current === null ||
      typeof current !== 'object' ||
      Array.isArray(current) ||
      !Object.hasOwn(current, part)
    ) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function setNestedValue(obj, keyPath, value) {
  const parts = Array.isArray(keyPath) ? keyPath : parseKeyPath(keyPath);
  let current = obj;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const existing = current[part];

    if (existing === undefined) {
      current[part] = {};
    } else if (
      existing === null ||
      typeof existing !== 'object' ||
      Array.isArray(existing)
    ) {
      throw new Error(
        `Cannot set "${parts.join('.')}": "${parts
          .slice(0, index + 1)
          .join('.')}" is already a translation value.`
      );
    }

    current = current[part];
  }

  current[parts.at(-1)] = value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deleteNestedValue(obj, keyPath) {
  const parts = Array.isArray(keyPath) ? keyPath : parseKeyPath(keyPath);
  const ancestors = [];
  let current = obj;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];

    if (!isPlainObject(current) || !Object.hasOwn(current, part)) {
      return false;
    }

    ancestors.push([current, part]);
    current = current[part];
  }

  const leafKey = parts.at(-1);
  if (!isPlainObject(current) || !Object.hasOwn(current, leafKey)) {
    return false;
  }

  delete current[leafKey];

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const [parent, key] = ancestors[index];
    const value = parent[key];

    if (isPlainObject(value) && Object.keys(value).length === 0) {
      delete parent[key];
    } else {
      break;
    }
  }

  return true;
}

function getAllKeyPaths(obj, prefix = '') {
  const paths = [];

  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...getAllKeyPaths(value, fullPath));
    } else {
      paths.push(fullPath);
    }
  }

  return paths;
}

module.exports = {
  DEFAULT_TRANSLATION_DIRS,
  deleteNestedValue,
  discoverTranslationDirs,
  formatJson,
  getAllKeyPaths,
  getDefaultTranslationDirs,
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
  sortObjectKeysDeep,
  writeSortedJsonFile,
};
