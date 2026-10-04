const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { buildAllowedPaths } = require('./release-please-auto-approve-core');

// Dependency-free JSONC reader: retain string offsets so metadata repairs cannot
// silently reserialize or modify any other lockfile byte. Reject duplicate keys.
function readLock(text) {
  if (typeof text !== 'string' || text.length > 16 * 1024 * 1024)
    throw new Error('Invalid lockfile size');
  let offset = 0;
  const versions = new Map();
  const space = () => {
    for (;;) {
      while (/\s/.test(text[offset] || '') && offset < text.length) offset++;
      if (text.slice(offset, offset + 2) === '//') {
        const end = text.indexOf('\n', offset);
        offset = end < 0 ? text.length : end;
      } else if (text.slice(offset, offset + 2) === '/*') {
        const end = text.indexOf('*/', offset + 2);
        if (end < 0) throw new Error('Unterminated lock comment');
        offset = end + 2;
      } else break;
    }
  };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === '\\') offset++;
      else if (character === '"')
        return {
          value: JSON.parse(text.slice(start, offset)),
          start,
          end: offset,
        };
    }
    throw new Error('Unterminated lock string');
  };
  const value = (path, depth = 0) => {
    if (depth > 64) throw new Error('Lock nesting exceeds limit');
    space();
    if (text[offset] === '"') {
      const item = string();
      if (
        path.length === 3 &&
        path[0] === 'workspaces' &&
        path[2] === 'version'
      )
        versions.set(path[1], item);
      return item.value;
    }
    if (text[offset] === '{' || text[offset] === '[') {
      const object = text[offset++] === '{';
      const end = object ? '}' : ']';
      const result = object ? Object.create(null) : [];
      space();
      while (text[offset] !== end) {
        let key = result.length;
        if (object) {
          if (text[offset] !== '"') throw new Error('Expected lock key');
          key = string().value;
          if (Object.hasOwn(result, key)) throw new Error('Duplicate lock key');
          space();
          if (text[offset++] !== ':') throw new Error('Expected lock colon');
        }
        result[key] = value([...path, String(key)], depth + 1);
        space();
        if (text[offset] === end) break;
        if (text[offset++] !== ',') throw new Error('Expected lock comma');
        space();
      }
      offset++;
      return result;
    }
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(offset)
      );
    if (!literal) throw new Error('Invalid lock value');
    offset += literal[0].length;
    return JSON.parse(literal[0]);
  };
  const parsed = value([]);
  space();
  if (
    offset !== text.length ||
    !parsed?.workspaces ||
    typeof parsed.workspaces !== 'object' ||
    Array.isArray(parsed.workspaces)
  )
    throw new Error('Invalid lockfile document');
  return { parsed, versions };
}

function validateWorkspaceLock(before, after, loadPackage) {
  const old = readLock(before);
  const current = readLock(after);
  const replacements = [];
  const changed = [];
  for (const [workspace, item] of current.versions) {
    const previous = old.versions.get(workspace);
    if (!previous || previous.value === item.value) continue;
    if (!workspace || !/^(?:apps|packages)\/[a-zA-Z0-9_-]+$/.test(workspace))
      throw new Error('Unsupported workspace version repair');
    const manifest = loadPackage(`${workspace}/package.json`);
    if (
      typeof manifest?.version !== 'string' ||
      manifest.version !== item.value
    )
      throw new Error(`Workspace version mismatch: ${workspace}`);
    replacements.push({
      ...item,
      raw: before.slice(previous.start, previous.end),
    });
    changed.push(workspace);
  }
  let restored = after;
  for (const item of replacements.sort((a, b) => b.start - a.start))
    restored =
      restored.slice(0, item.start) + item.raw + restored.slice(item.end);
  if (restored !== before)
    throw new Error('Lockfile changes exceed workspace versions');
  return changed;
}

function validateGitWorkspaceLock(base, head = 'HEAD', working = false) {
  const git = (...args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  const allowed = buildAllowedPaths(
    JSON.parse(git('show', `${base}:release-please-config.json`))
  );
  const changed = git('diff', '--name-only', '-z', `${base}...${head}`)
    .split('\0')
    .filter(Boolean);
  if (working)
    changed.push(
      ...git('diff', 'HEAD', '--name-only', '-z').split('\0').filter(Boolean),
      ...git('ls-files', '--others', '--exclude-standard', '-z')
        .split('\0')
        .filter(Boolean)
    );
  if (changed.some((file) => file !== 'bun.lock' && !allowed.has(file)))
    throw new Error('Release contains non-generated paths');
  const before = git('show', `${base}:bun.lock`);
  const after = working
    ? readFileSync('bun.lock', 'utf8')
    : git('show', `${head}:bun.lock`);
  return validateWorkspaceLock(before, after, (file) =>
    JSON.parse(git('show', `${head}:${file}`))
  );
}

if (require.main === module) {
  const [base, head = 'HEAD', mode] = process.argv.slice(2);
  if (!base || (mode && mode !== '--working'))
    throw new Error('Usage: release-workspace-lock.js BASE [HEAD] [--working]');
  console.log(
    `Verified ${validateGitWorkspaceLock(base, head, mode === '--working').length} workspace lock versions`
  );
}
module.exports = { readLock, validateWorkspaceLock, validateGitWorkspaceLock };
