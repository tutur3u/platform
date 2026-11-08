const {
  normalizeReleaseNotes,
  normalizeMobileReleaseNotes,
} = require('./normalize-release-notes');
const { GitHubClient, resolveToken } = require('./release-please-auto-approve');

/** Component summaries deliberately repeat platform notes; dedupe within each. */
function normalizeReleaseDescription(body) {
  if (!body.includes('This PR was generated with [Release Please]'))
    return body;
  return body.replace(/<details>([\s\S]*?)<\/details>/g, (section, content) => {
    if (!/^<summary>[^<]+<\/summary>\s*\n+## \[/u.test(content)) return section;
    return `<details>${normalizeReleaseNotes(content, '')}</details>`;
  });
}

async function normalizeReleasePullRequest(
  client,
  targetBranch = 'production'
) {
  const pull = await client.findReleasePullRequest(targetBranch);
  if (!pull) return { changed: false, reason: 'No generated release PR' };
  const body = normalizeReleaseDescription(pull.body || '');
  if (body === pull.body)
    return { changed: false, reason: 'Already normalized' };
  const current = await client.request('GET', `/pulls/${pull.number}`);
  if (
    current.state !== 'open' ||
    current.head.sha !== pull.head.sha ||
    current.body !== pull.body ||
    current.base.ref !== targetBranch ||
    current.head.ref !== `release-please--branches--${targetBranch}`
  ) {
    throw new Error(
      'Release PR changed during normalization; retry from its current state'
    );
  }
  await client.request('PATCH', `/pulls/${pull.number}`, { body: { body } });
  return { changed: true, number: pull.number };
}

/** Play summaries stop at a complete priority bullet; other store history is unchanged. */
function normalizeMobileStoreDescription(content) {
  const bullets = normalizeMobileReleaseNotes(content).split('\n');
  const selected = [];
  let characters = 0;
  for (const bullet of bullets) {
    const nextLength = Array.from(bullet).length + (selected.length ? 1 : 0);
    if (characters + nextLength > 500) break;
    selected.push(bullet);
    characters += nextLength;
  }
  // An oversized first bullet yields no text, so the existing nonempty guard fails.
  return selected.join('\n');
}

async function main() {
  const token = resolveToken();
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository)
    throw new Error('GitHub token and repository are required');
  const client = new GitHubClient({ repository, token });
  console.log(await normalizeReleasePullRequest(client));
}

module.exports = { normalizeReleaseDescription, normalizeReleasePullRequest };
if (require.main === module && process.argv[2] === '--mobile') {
  const fs = require('node:fs');
  process.stdout.write(
    normalizeMobileStoreDescription(fs.readFileSync(0, 'utf8'))
  );
} else if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
