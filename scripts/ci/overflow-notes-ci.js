const { execFileSync } = require('node:child_process');

const NOTES_REF =
  'refs/heads/release-please--branches--production--release-notes';
const HEADER = ':robot: I have created a release *beep* *boop*';
const FOOTER =
  'This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).';

function isValidatedOverflowNotesPush(
  env = process.env,
  git = (...args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== NOTES_REF)
    return false;
  if (!/^[a-f0-9]{40}$/i.test(env.GITHUB_SHA || '')) return false;
  try {
    const base = git(
      'merge-base',
      'refs/remotes/origin/production',
      env.GITHUB_SHA
    ).trim();
    const paths = git('diff', '--name-status', '-z', base, env.GITHUB_SHA)
      .split('\0')
      .filter(Boolean);
    // Historical bootstrap refs are production ancestors with no new work.
    if (paths.length === 0) return true;
    // Never hide source, deletions, renames, release version changes, or unknown paths.
    if (
      paths.length !== 2 ||
      !['A', 'M'].includes(paths[0]) ||
      paths[1] !== 'release-notes.md'
    )
      return false;
    const notes = git('show', `${env.GITHUB_SHA}:release-notes.md`);
    return (
      notes.length <= 1024 * 1024 &&
      notes.startsWith(`${HEADER}\n---\n`) &&
      notes.trimEnd().endsWith(`---\n${FOOTER}`) &&
      /<details><summary>[^\n<>]+<\/summary>\n\n[\s\S]+\n<\/details>/.test(
        notes
      )
    );
  } catch {
    // Missing comparison history or malformed input must retain ordinary validation.
    return false;
  }
}
if (require.main === module)
  console.log(String(isValidatedOverflowNotesPush()));
module.exports = { NOTES_REF, isValidatedOverflowNotesPush };
