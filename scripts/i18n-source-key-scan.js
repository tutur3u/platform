const fs = require('node:fs');
const path = require('node:path');

const TRANSLATOR_METHODS = new Set(['has', 'markup', 'raw', 'rich']);
const TRANSLATOR_DECLARATION_REGEX =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s*)?(?:useTranslations|getTranslations)\(\s*(?:(['"])([^'"]+)\2|\{[\s\S]*?\bnamespace\s*:\s*(['"])([^'"]+)\4[\s\S]*?\})?\s*\)/g;
const ARROW_TRANSLATOR_PARAMETER_REGEX =
  /\b(t|translate|translator)\s*:\s*\(\s*key\s*:\s*string\s*\)\s*=>\s*string/g;
const RETURN_TYPE_TRANSLATOR_PARAMETER_REGEX =
  /\b(t|translate|translator)\s*:\s*(?:Awaited\s*<\s*)?ReturnType\s*<\s*typeof\s+(?:useTranslations|getTranslations)(?:\s*<\s*(['"])([^'"]+)\2\s*>)?\s*>\s*>?/g;

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

function findFollowingBlockEnd(bracePairs, position, fallbackEnd) {
  let bestOpen = fallbackEnd;
  let bestClose = fallbackEnd;

  for (const [open, close] of bracePairs.entries()) {
    if (position < open && open < bestOpen) {
      bestOpen = open;
      bestClose = close;
    }
  }

  return bestClose;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isForwardedAsSameNameJsxProp(content, variableName) {
  const escapedVariableName = escapeRegExp(variableName);
  const propRegex = new RegExp(
    `\\b${escapedVariableName}\\s*=\\s*\\{\\s*${escapedVariableName}(?:\\s+as\\b[^}]*)?\\s*\\}`
  );

  return propRegex.test(content);
}

function findFirstArgumentEnd(content, start, end) {
  const stack = [];
  let state = 'code';

  for (let index = start; index < end; index += 1) {
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

    if (char === '(' || char === '[' || char === '{') {
      stack.push(char);
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      if (stack.length === 0) {
        return char === ')' ? index : end;
      }

      stack.pop();
      continue;
    }

    if (char === ',' && stack.length === 0) {
      return index;
    }
  }

  return end;
}

function readQuotedString(content, start) {
  const quote = content[start];
  let value = '';

  for (let index = start + 1; index < content.length; index += 1) {
    const char = content[index];

    if (char === '\\') {
      const next = content[index + 1];
      if (next !== undefined) {
        value += next;
        index += 1;
      }
      continue;
    }

    if (char === quote) {
      return { end: index, value };
    }

    value += char;
  }

  return null;
}

function splitTopLevelTernary(content) {
  const stack = [];
  let state = 'code';
  let questionIndex = -1;
  let nestedTernaryDepth = 0;

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

    if (char === '(' || char === '[' || char === '{') {
      stack.push(char);
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      if (stack.length > 0) stack.pop();
      continue;
    }

    if (stack.length > 0) continue;

    if (char === '?' && next !== '.' && next !== '?') {
      if (questionIndex === -1) {
        questionIndex = index;
      } else {
        nestedTernaryDepth += 1;
      }
      continue;
    }

    if (char === ':' && questionIndex !== -1) {
      if (nestedTernaryDepth > 0) {
        nestedTernaryDepth -= 1;
        continue;
      }

      return {
        alternate: content.slice(index + 1),
        consequent: content.slice(questionIndex + 1, index),
      };
    }
  }

  return null;
}

function collectTranslationKeyLiterals(expression) {
  const trimmed = expression.trim();
  if (!trimmed) return [];

  if (trimmed[0] === "'" || trimmed[0] === '"') {
    const parsed = readQuotedString(trimmed, 0);
    if (parsed) {
      const trailing = trimmed.slice(parsed.end + 1).trim();
      if (!trailing || /^as\b/.test(trailing)) {
        return [parsed.value];
      }
    }
  }

  const ternary = splitTopLevelTernary(trimmed);
  if (ternary) {
    return [
      ...collectTranslationKeyLiterals(ternary.consequent),
      ...collectTranslationKeyLiterals(ternary.alternate),
    ];
  }

  return [];
}

function isPositionInRanges(position, ranges) {
  return ranges.some(({ end, start }) => start <= position && position < end);
}

function findTranslatorCalls(
  content,
  variableName,
  start,
  end,
  excludedRanges = []
) {
  const methods = [...TRANSLATOR_METHODS].join('|');
  const callRegex = new RegExp(
    `\\b${escapeRegExp(variableName)}(?:\\.(?:${methods}))?\\(\\s*`,
    'g'
  );
  const keys = [];
  callRegex.lastIndex = start;

  let match = callRegex.exec(content);
  while (match !== null) {
    if (match.index >= end) break;
    if (isPositionInRanges(match.index, excludedRanges)) {
      match = callRegex.exec(content);
      continue;
    }

    const argumentStart = callRegex.lastIndex;
    const argumentEnd = findFirstArgumentEnd(content, argumentStart, end);
    keys.push(
      ...collectTranslationKeyLiterals(
        content.slice(argumentStart, argumentEnd)
      )
    );

    match = callRegex.exec(content);
  }

  return keys;
}

function scanSourceKeys(
  rootDir,
  sourceDir,
  {
    includeTranslatorParameters = false,
    skipUnresolvedTranslatorParameters = false,
  } = {}
) {
  const results = [];
  const files = findSourceFiles(rootDir, sourceDir);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relPath = path.relative(rootDir, filePath);
    const bracePairs = buildBracePairs(content);
    const declarations = [];
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
      declarations.push({
        index: declarationMatch.index,
        kind: 'declaration',
        namespace,
        scopeEnd,
        variableName,
      });

      declarationMatch = TRANSLATOR_DECLARATION_REGEX.exec(content);
    }

    if (includeTranslatorParameters) {
      for (const parameterRegex of [
        ARROW_TRANSLATOR_PARAMETER_REGEX,
        RETURN_TYPE_TRANSLATOR_PARAMETER_REGEX,
      ]) {
        parameterRegex.lastIndex = 0;
        let parameterMatch = parameterRegex.exec(content);
        while (parameterMatch !== null) {
          declarations.push({
            index: parameterMatch.index,
            kind: 'parameter',
            namespace: parameterMatch[3] ?? null,
            scopeEnd: findFollowingBlockEnd(
              bracePairs,
              parameterMatch.index,
              content.length
            ),
            variableName: parameterMatch[1],
          });

          parameterMatch = parameterRegex.exec(content);
        }
      }

      for (const declaration of declarations) {
        if (declaration.kind !== 'parameter' || declaration.namespace !== null)
          continue;

        const candidateNamespaces = new Set(
          declarations
            .filter(
              (candidate) =>
                candidate.kind === 'declaration' &&
                candidate.variableName === declaration.variableName
            )
            .map((candidate) => candidate.namespace)
        );

        if (candidateNamespaces.size === 1) {
          declaration.namespace = [...candidateNamespaces][0];
        }
      }
    }

    for (const declaration of declarations) {
      if (
        declaration.namespace === null &&
        skipUnresolvedTranslatorParameters
      ) {
        continue;
      }
      const isForwardedTranslator = isForwardedAsSameNameJsxProp(
        content.slice(declaration.index, declaration.scopeEnd),
        declaration.variableName
      );
      const excludedRanges = isForwardedTranslator
        ? declarations
            .filter(
              (other) =>
                other !== declaration &&
                other.variableName === declaration.variableName
            )
            .map((other) => ({ end: other.scopeEnd, start: other.index }))
        : [];

      for (const key of findTranslatorCalls(
        content,
        declaration.variableName,
        isForwardedTranslator ? 0 : declaration.index,
        isForwardedTranslator ? content.length : declaration.scopeEnd,
        excludedRanges
      )) {
        results.push({
          namespace: declaration.namespace ?? '',
          key,
          file: relPath,
        });
      }
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

    const appSourceKeyExceptions = new Set(
      exceptions.appSourceKeyExceptions?.[app.name] || []
    );
    const missingKeys = [];

    for (const { namespace, key, file } of scanSourceKeys(rootDir, sourceDir, {
      includeTranslatorParameters: true,
      skipUnresolvedTranslatorParameters: true,
    })) {
      if (isKeyExcepted(appSourceKeyExceptions, namespace, key)) continue;
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
