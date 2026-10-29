const { execFileSync } = require('node:child_process');
const { appendFileSync, readFileSync } = require('node:fs');

function isDocumentation(file) {
  if (!/\.(md|mdx)$/.test(file)) return false;
  if (file.startsWith('apps/docs/')) return true;
  return !file.startsWith('apps/') && !file.startsWith('packages/');
}

function requiresCode({ eventName, event, root = process.cwd() }) {
  // Push and release validation always retain their existing execution policy.
  if (eventName !== 'pull_request') return true;
  const base = event?.pull_request?.base?.sha;
  const head = event?.pull_request?.head?.sha;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? ''))) {
    return true;
  }
  try {
    const ancestors = execFileSync('git', ['merge-base', '--all', base, head], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    if (ancestors.length !== 1 || !/^[a-f0-9]{40}$/.test(ancestors[0]))
      return true;
    const output = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', ancestors[0], head, '--'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
    );
    const files = output.split('\0').filter(Boolean);
    return files.length === 0 || files.some((file) => !isDocumentation(file));
  } catch {
    // Missing history, ambiguous merge bases and oversized diffs retain tests.
    return true;
  }
}

if (require.main === module) {
  let code = true;
  try {
    code = requiresCode({
      eventName: process.env.GITHUB_EVENT_NAME,
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
    });
  } catch {
    // An unreadable event is not proof of a documentation-only change.
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `code=${code}\n`);
  console.log(`Test code changes: ${code}`);
}

module.exports = { isDocumentation, requiresCode };
