const fs = require('node:fs');
const path = require('node:path');

const TRANSLATOR_METHODS = new Set(['has', 'markup', 'raw', 'rich']);
const TRANSLATOR_DECLARATION_REGEX =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s*)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([^'"]+)\2|\{[\s\S]*?\bnamespace\s*:\s*(['"])([^'"]+)\4[\s\S]*?\})?\s*\)/g;

function isCheckableSourceFile(fileName) {
  if (!/\.(ts|tsx|js|jsx)$/.test(fileName)) return false;
  if (/\.d\.ts$/.test(fileName)) return false;
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(fileName)) return false;
  return true;
}

function findSourceFiles(rootDir, dir) {
  const results = [];
  const fullDir = path.join(rootDir, dir);

  if (!fs.existsSync(fullDir)) return results;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '__tests__'
        ) {
          continue;
        }
        walk(fullPath);
      } else if (isCheckableSourceFile(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(fullDir);
  return results;
}

function buildBracePairs(content) {
  const stack = [];
  const pairs = new Map();
  let state = 'code';

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        index += 1;
      }
      continue;
    }

    if (state === 'single-quote') {
      if (char === '\\') {
        index += 1;
      } else if (char === "'") {
        state = 'code';
      }
      continue;
    }

    if (state === 'double-quote') {
      if (char === '\\') {
        index += 1;
      } else if (char === '"') {
        state = 'code';
      }
      continue;
    }

    if (state === 'template') {
      if (char === '\\') {
        index += 1;
      } else if (char === '`') {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      state = 'block-comment';
      index += 1;
      continue;
    }

    if (char === "'") {
      state = 'single-quote';
      continue;
    }

    if (char === '"') {
      state = 'double-quote';
      continue;
    }

    if (char === '`') {
      state = 'template';
      continue;
    }

    if (char === '{') {
      stack.push(index);
      continue;
    }

    if (char === '}') {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, index);
    }
  }

  return pairs;
}

function findContainingBlockEnd(bracePairs, position, fallbackEnd) {
  let bestOpen = -1;
  let bestClose = fallbackEnd;

  for (const [open, close] of bracePairs.entries()) {
    if (open < position && position < close && open > bestOpen) {
      bestOpen = open;
      bestClose = close;
    }
  }

  return bestClose;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findTranslatorCalls(content, variableName, start, end) {
  const methods = [...TRANSLATOR_METHODS].join('|');
  const callRegex = new RegExp(
    `\\b${escapeRegExp(variableName)}(?:\\.(?:${methods}))?\\(\\s*(['"])([^'"]+)\\1`,
    'g'
  );
  const keys = [];
  callRegex.lastIndex = start;

  let match = callRegex.exec(content);
  while (match !== null) {
    if (match.index >= end) break;
    keys.push(match[2]);
    match = callRegex.exec(content);
  }

  return keys;
}

function scanSourceKeys(rootDir, sourceDir) {
  const results = [];
  const files = findSourceFiles(rootDir, sourceDir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(rootDir, filePath);
    const bracePairs = buildBracePairs(content);
    TRANSLATOR_DECLARATION_REGEX.lastIndex = 0;

    let declarationMatch = TRANSLATOR_DECLARATION_REGEX.exec(content);
    while (declarationMatch !== null) {
      const variableName = declarationMatch[1];
      const namespace = declarationMatch[3] ?? declarationMatch[5] ?? '';
      const scopeEnd = findContainingBlockEnd(
        bracePairs,
        declarationMatch.index,
        content.length
      );

      for (const key of findTranslatorCalls(
        content,
        variableName,
        declarationMatch.index,
        scopeEnd
      )) {
        results.push({ namespace, key, file: relPath });
      }

      declarationMatch = TRANSLATOR_DECLARATION_REGEX.exec(content);
    }
  }

  return results;
}

function resolveKeyPath(json, namespace, key) {
  const segments = [
    ...(namespace ? namespace.split('.') : []),
    ...key.split('.'),
  ];
  let current = json;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return false;
    if (!(segment in current)) return false;
    current = current[segment];
  }

  return current !== null && current !== undefined;
}

function isKeyExcepted(keyExceptionSet, namespace, key) {
  const fullPath = namespace ? `${namespace}.${key}` : key;

  if (keyExceptionSet.has(fullPath)) return true;

  const segments = fullPath.split('.');
  for (let index = 1; index < segments.length; index += 1) {
    const prefix = `${segments.slice(0, index).join('.')}.*`;
    if (keyExceptionSet.has(prefix)) return true;
  }

  return false;
}

function getAppTranslations(rootDir, appDir) {
  const enJsonPath = path.join(rootDir, appDir, 'messages', 'en.json');
  if (!fs.existsSync(enJsonPath)) return null;

  return JSON.parse(fs.readFileSync(enJsonPath, 'utf-8'));
}

function discoverAppsWithMessageBundles(rootDir) {
  const appsDir = path.join(rootDir, 'apps');
  if (!fs.existsSync(appsDir)) return [];

  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      dir: `apps/${entry.name}`,
      name: `apps/${entry.name}`,
    }))
    .filter((app) =>
      fs.existsSync(path.join(rootDir, app.dir, 'messages', 'en.json'))
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function checkAppSourceKeys({ exceptions = {}, rootDir }) {
  const failures = [];

  for (const app of discoverAppsWithMessageBundles(rootDir)) {
    const sourceDir = path.join(app.dir, 'src');
    if (!fs.existsSync(path.join(rootDir, sourceDir))) continue;

    const appJson = getAppTranslations(rootDir, app.dir);
    if (!appJson) continue;

    const appKeyExceptions = new Set(
      exceptions.keyExceptions?.[app.name] || []
    );
    const missingKeys = [];

    for (const { namespace, key, file } of scanSourceKeys(rootDir, sourceDir)) {
      if (isKeyExcepted(appKeyExceptions, namespace, key)) continue;
      if (!resolveKeyPath(appJson, namespace, key)) {
        missingKeys.push({ namespace, key, file });
      }
    }

    if (missingKeys.length === 0) continue;

    const uniqueKeys = new Map();
    for (const { namespace, key, file } of missingKeys) {
      const id = `${namespace}::${key}`;
      if (!uniqueKeys.has(id)) {
        uniqueKeys.set(id, { namespace, key, files: new Set() });
      }
      uniqueKeys.get(id).files.add(file);
    }

    failures.push({
      appDir: app.dir,
      missing: [...uniqueKeys.values()].sort((left, right) => {
        const nsCmp = left.namespace.localeCompare(right.namespace);
        return nsCmp !== 0 ? nsCmp : left.key.localeCompare(right.key);
      }),
    });
  }

  return failures;
}

module.exports = {
  checkAppSourceKeys,
  scanSourceKeys,
};
