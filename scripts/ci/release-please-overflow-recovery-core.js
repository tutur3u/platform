const RELEASE_NOTES_FILENAME = 'release-notes.md';
const OVERFLOW_MESSAGE =
  'This release is too large to preview in the pull request body. View the full release notes here:';
const DEFAULT_HEADER = ':robot: I have created a release *beep* *boop*';
const DEFAULT_FOOTER =
  'This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).';
const NOTES_DELIMITER = '---';
const PENDING_LABEL = 'autorelease: pending';
const RELEASE_BRANCH_PREFIX = 'release-please--branches--';

function releaseBranchFor(targetBranch) {
  return `${RELEASE_BRANCH_PREFIX}${targetBranch}`;
}

function notesBranchFor(targetBranch) {
  return `${releaseBranchFor(targetBranch)}--release-notes`;
}

// Recovery writes with an admin token, so only the generated same-repository
// release PR may select it, and only onto its own notes branch. A pull request
// body is attacker-controlled: a fork or a lookalike head could otherwise
// point the write at production or main.
function overflowRecoveryTarget(pullRequest, targetBranch) {
  if (pullRequest.head?.ref !== releaseBranchFor(targetBranch))
    return undefined;
  if (pullRequest.base?.ref !== targetBranch) return undefined;

  const headRepository = pullRequest.head?.repo?.full_name;
  if (!headRepository || headRepository !== pullRequest.base?.repo?.full_name) {
    return undefined;
  }

  const notesBranch = extractOverflowBranchName(pullRequest.body || '');
  if (notesBranch !== notesBranchFor(targetBranch)) return undefined;

  return { notesBranch, pullRequest };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractOverflowBranchName(body) {
  const match = body.match(
    new RegExp(`${escapeRegExp(OVERFLOW_MESSAGE)} (?<url>\\S+)`, 'u')
  );

  if (!match?.groups?.url) return undefined;

  const url = new URL(match.groups.url);
  const blobSegment = '/blob/';
  const blobIndex = url.pathname.indexOf(blobSegment);
  const suffix = `/${RELEASE_NOTES_FILENAME}`;

  if (blobIndex === -1 || !url.pathname.endsWith(suffix)) return undefined;

  return decodeURIComponent(
    url.pathname.slice(blobIndex + blobSegment.length, -suffix.length)
  );
}

function parseManifestVersionChanges(patch) {
  const removed = new Map();
  const added = new Map();

  for (const line of patch.split('\n')) {
    const match = line.match(
      /^([-+]) {2}"(?<path>[^"]+)": "(?<version>[^"]+)"/u
    );
    if (!match?.groups) continue;

    const versions = match[1] === '-' ? removed : added;
    versions.set(match.groups.path, match.groups.version);
  }

  return [...added.entries()]
    .filter(([releasePath, version]) => removed.get(releasePath) !== version)
    .map(([releasePath, version]) => ({
      previousVersion: removed.get(releasePath),
      releasePath,
      version,
    }));
}

function getPackageConfig(config, releasePath) {
  return config.packages?.[releasePath] || {};
}

function getComponent(config, releasePath) {
  const packageConfig = getPackageConfig(config, releasePath);

  return (
    packageConfig.component ||
    config.component ||
    packageConfig['package-name'] ||
    undefined
  );
}

function getChangelogPath(config, releasePath) {
  const packageConfig = getPackageConfig(config, releasePath);
  const changelogPath =
    packageConfig['changelog-path'] || config['changelog-path'];

  if (changelogPath) {
    return releasePath === '.'
      ? changelogPath
      : `${releasePath}/${changelogPath}`;
  }

  return releasePath === '.' ? 'CHANGELOG.md' : `${releasePath}/CHANGELOG.md`;
}

function extractChangelogEntry(changelog, version) {
  const lines = changelog.replace(/\r\n/gu, '\n').split('\n');
  const heading = new RegExp(
    `^##\\s+\\[?${escapeRegExp(version)}(?:\\]|\\s|\\(|$)`,
    'u'
  );
  const startIndex = lines.findIndex((line) => heading.test(line));

  if (startIndex === -1) {
    throw new Error(`Could not find changelog entry for ${version}`);
  }

  let endIndex = lines.length;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function buildReleaseNotesDocument(entries) {
  const details = entries
    .map(({ component, notes, version }) => {
      const summary = component ? `${component}: ${version}` : version;

      return `<details><summary>${summary}</summary>\n\n${notes.trim()}\n</details>`;
    })
    .join('\n\n');

  return `${DEFAULT_HEADER}
${NOTES_DELIMITER}


${details}

${NOTES_DELIMITER}
${DEFAULT_FOOTER}`;
}

async function findMergedPendingOverflowPullRequest(github, targetBranch) {
  for (let page = 1; page <= 3; page += 1) {
    const pullRequests = await github.listClosedPullRequests(
      targetBranch,
      page
    );

    for (const pullRequest of pullRequests) {
      if (!pullRequest.merged_at) continue;

      const recoveryTarget = overflowRecoveryTarget(pullRequest, targetBranch);
      if (!recoveryTarget) continue;

      const labels = await github.getIssueLabels(pullRequest.number);
      if (!labels.includes(PENDING_LABEL)) continue;

      return recoveryTarget;
    }

    if (pullRequests.length < 25) break;
  }

  return undefined;
}

// Release Please rewrites overflow notes in two API steps: it first resets the
// notes branch to the target branch, then commits release-notes.md. A failure
// in between leaves the open release PR pointing at a missing file, and every
// later run fails while parsing that PR. Its own changelogs restore the notes.
async function findOpenOverflowPullRequest(github, targetBranch) {
  const pullRequests = await github.listOpenPullRequests(targetBranch);

  for (const pullRequest of pullRequests) {
    const recoveryTarget = overflowRecoveryTarget(pullRequest, targetBranch);
    if (recoveryTarget) return recoveryTarget;
  }

  return undefined;
}

async function buildReleaseNotesFromPullRequest({
  changelogRef,
  configFile,
  github,
  manifestFile,
  pullRequest,
  targetBranch,
}) {
  const files = await github.getPullRequestFiles(pullRequest.number);
  const manifestChange = files.find((file) => file.filename === manifestFile);

  if (!manifestChange?.patch) {
    throw new Error(
      `Could not recover release notes because ${manifestFile} was not patched in PR #${pullRequest.number}`
    );
  }

  const versionChanges = parseManifestVersionChanges(manifestChange.patch);
  if (versionChanges.length === 0) {
    throw new Error(
      `Could not recover release notes because ${manifestFile} had no version changes in PR #${pullRequest.number}`
    );
  }

  const config = await github.getJsonFile(configFile, targetBranch);
  const entries = [];

  for (const { releasePath, version } of versionChanges) {
    const changelogPath = getChangelogPath(config, releasePath);
    const changelog = await github.getTextFile(
      changelogPath,
      changelogRef || targetBranch
    );

    entries.push({
      component: getComponent(config, releasePath),
      notes: extractChangelogEntry(changelog, version),
      releasePath,
      version,
    });
  }

  return buildReleaseNotesDocument(entries);
}

async function recoverReleasePleaseOverflowNotes({
  configFile = 'release-please-config.json',
  github,
  manifestFile = '.release-please-manifest.json',
  targetBranch = 'production',
}) {
  const mergedTarget = await findMergedPendingOverflowPullRequest(
    github,
    targetBranch
  );
  const recoveryTarget =
    mergedTarget || (await findOpenOverflowPullRequest(github, targetBranch));

  if (!recoveryTarget) {
    return { status: 'skipped', reason: 'no merged pending overflow PR' };
  }

  // Fail closed before any read or write if a selector ever regresses.
  if (recoveryTarget.notesBranch !== notesBranchFor(targetBranch)) {
    throw new Error(
      `Refusing overflow recovery onto ${recoveryTarget.notesBranch}; only ${notesBranchFor(targetBranch)} may be written`
    );
  }

  const existingNotes = await github.getTextFile(
    RELEASE_NOTES_FILENAME,
    recoveryTarget.notesBranch,
    { allowMissing: true }
  );

  if (existingNotes !== undefined) {
    return {
      branch: recoveryTarget.notesBranch,
      pullRequestNumber: recoveryTarget.pullRequest.number,
      status: 'exists',
    };
  }

  const notes = await buildReleaseNotesFromPullRequest({
    // A merged release's changelogs are on the target branch; an open one's
    // exist only on the release PR head.
    changelogRef: mergedTarget
      ? targetBranch
      : recoveryTarget.pullRequest.head.sha,
    configFile,
    github,
    manifestFile,
    pullRequest: recoveryTarget.pullRequest,
    targetBranch,
  });
  const existingBranchSha = await github.getBranchSha(
    recoveryTarget.notesBranch,
    { allowMissing: true }
  );

  const message = `chore(release): recover overflow notes for ${targetBranch}`;
  if (!existingBranchSha) {
    const sourceSha = await github.getBranchSha(targetBranch);
    await github.createBranchWithFile(
      recoveryTarget.notesBranch,
      sourceSha,
      RELEASE_NOTES_FILENAME,
      notes,
      message
    );
  } else {
    await github.createFile(
      RELEASE_NOTES_FILENAME,
      recoveryTarget.notesBranch,
      notes,
      message
    );
  }

  return {
    branch: recoveryTarget.notesBranch,
    pullRequestNumber: recoveryTarget.pullRequest.number,
    status: 'created',
  };
}

module.exports = {
  RELEASE_NOTES_FILENAME,
  buildReleaseNotesDocument,
  buildReleaseNotesFromPullRequest,
  extractChangelogEntry,
  extractOverflowBranchName,
  findMergedPendingOverflowPullRequest,
  findOpenOverflowPullRequest,
  getChangelogPath,
  notesBranchFor,
  overflowRecoveryTarget,
  getComponent,
  parseManifestVersionChanges,
  recoverReleasePleaseOverflowNotes,
};
