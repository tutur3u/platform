const { normalizeReleaseNotes } = require('./normalize-release-notes');
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

async function main() {
  const token = resolveToken();
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository)
    throw new Error('GitHub token and repository are required');
  const client = new GitHubClient({ repository, token });
  console.log(await normalizeReleasePullRequest(client));
}

module.exports = { normalizeReleaseDescription, normalizeReleasePullRequest };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
