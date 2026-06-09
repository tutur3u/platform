const RELEASE_NOTES_FILENAME = 'release-notes.md';
const OVERFLOW_MESSAGE =
  'This release is too large to preview in the pull request body. View the full release notes here:';
const DEFAULT_HEADER = ':robot: I have created a release *beep* *boop*';
const DEFAULT_FOOTER =
  'This PR was generated with [Release Please](https://github.com/googleapis/release-please). See [documentation](https://github.com/googleapis/release-please#release-please).';
const NOTES_DELIMITER = '---';
const PENDING_LABEL = 'autorelease: pending';

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
      if (!pullRequest.head?.ref?.startsWith('release-please--branches--')) {
        continue;
      }

      const notesBranch = extractOverflowBranchName(pullRequest.body || '');
      if (!notesBranch) continue;

      const labels = await github.getIssueLabels(pullRequest.number);
      if (!labels.includes(PENDING_LABEL)) continue;

      return {
        notesBranch,
        pullRequest,
      };
    }

    if (pullRequests.length < 25) break;
  }

  return undefined;
}

async function buildReleaseNotesFromPullRequest({
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
    const changelog = await github.getTextFile(changelogPath, targetBranch);

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
  const recoveryTarget = await findMergedPendingOverflowPullRequest(
    github,
    targetBranch
  );

  if (!recoveryTarget) {
    return { status: 'skipped', reason: 'no merged pending overflow PR' };
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

  if (!existingBranchSha) {
    const sourceSha = await github.getBranchSha(targetBranch);
    await github.createBranch(recoveryTarget.notesBranch, sourceSha);
  }

  await github.createFile(
    RELEASE_NOTES_FILENAME,
    recoveryTarget.notesBranch,
    notes,
    `chore(release): recover overflow notes for ${targetBranch}`
  );

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
  getChangelogPath,
  getComponent,
  parseManifestVersionChanges,
  recoverReleasePleaseOverflowNotes,
};
