const RELEASE_BRANCH_PREFIX = 'release-please--branches--';
const RELEASE_COMMIT_SUBJECT = /^chore\(release\): release /u;
const MANIFEST_FILE = '.release-please-manifest.json';
const DEFAULT_CHANGELOG = 'CHANGELOG.md';
const DEFAULT_RELEASE_TYPE = 'node';
const DEFAULT_APPROVED_AUTHORS = ['github-actions[bot]'];

// The version file each release type rewrites. Anything else is a release type
// this repo does not use yet, and an unknown type must narrow the allowlist
// rather than widen it — so it contributes no version file at all and the
// package's bump shows up as an unexpected path.
const VERSION_FILE_BY_RELEASE_TYPE = {
  dart: 'pubspec.yaml',
  node: 'package.json',
};

function joinPackagePath(packagePath, filePath) {
  if (!packagePath || packagePath === '.') return filePath;

  return `${packagePath.replace(/\/$/u, '')}/${filePath}`;
}

function collectExtraFiles(packagePath, extraFiles) {
  const paths = [];

  for (const entry of extraFiles || []) {
    const filePath = typeof entry === 'string' ? entry : entry?.path;

    if (!filePath) continue;

    // release-please resolves a generic extra-file against the repository root
    // for the root package and against the package otherwise. Allow both
    // spellings: this is an allowlist of paths a release is permitted to touch,
    // and both readings describe the same generated bump.
    paths.push(filePath, joinPackagePath(packagePath, filePath));
  }

  return paths;
}

/**
 * Derive the exact set of files a release-please PR is allowed to change from
 * release-please-config.json, rather than hard-coding it. The config is the
 * only thing that decides which files a release rewrites, so reading it is what
 * keeps this allowlist from drifting when a package is added or its release
 * type changes.
 */
function buildAllowedPaths(config) {
  const allowed = new Set([MANIFEST_FILE]);
  const packages = config?.packages || {};

  for (const [packagePath, packageConfig] of Object.entries(packages)) {
    const releaseType =
      packageConfig['release-type'] ||
      config['release-type'] ||
      DEFAULT_RELEASE_TYPE;

    allowed.add(
      joinPackagePath(
        packagePath,
        packageConfig['changelog-path'] || DEFAULT_CHANGELOG
      )
    );

    const versionFile =
      packageConfig['version-file'] ||
      VERSION_FILE_BY_RELEASE_TYPE[releaseType];

    if (versionFile) {
      allowed.add(joinPackagePath(packagePath, versionFile));
    }

    for (const extraPath of collectExtraFiles(
      packagePath,
      packageConfig['extra-files']
    )) {
      allowed.add(extraPath);
    }
  }

  for (const extraPath of collectExtraFiles('.', config?.['extra-files'])) {
    allowed.add(extraPath);
  }

  return allowed;
}

function getCommitAuthorLogin(commit) {
  return commit?.author?.login || commit?.committer?.login || null;
}

function isApprovedAuthor(login, type, approvedAuthors) {
  if (type === 'Bot') return true;

  return approvedAuthors.includes(login);
}

function skip(reason) {
  return { approve: false, reason };
}

/**
 * Decide whether a release PR is untouched generated output and may be
 * approved. Every rule below has to hold; the caller treats a `false` as "leave
 * the PR alone", never as an error.
 *
 * Note that this does not need to un-approve anything. The `Protected branches`
 * ruleset sets `dismiss_stale_reviews_on_push`, so any push to the head branch
 * drops existing approvals — including a push this workflow never observes.
 */
function evaluateReleasePullRequest({
  allowedPaths,
  approvedAuthors = DEFAULT_APPROVED_AUTHORS,
  commits,
  files,
  pullRequest,
  targetBranch,
}) {
  if (pullRequest?.state !== 'open') {
    return skip(`pull request is ${pullRequest?.state || 'missing'}`);
  }

  if (pullRequest.draft) return skip('pull request is a draft');

  if (!pullRequest.head?.ref?.startsWith(RELEASE_BRANCH_PREFIX)) {
    return skip(
      `head branch ${pullRequest.head?.ref} is not a release-please branch`
    );
  }

  if (targetBranch && pullRequest.base?.ref !== targetBranch) {
    return skip(
      `pull request targets ${pullRequest.base?.ref}, not ${targetBranch}`
    );
  }

  const authorLogin = pullRequest.user?.login;

  if (!isApprovedAuthor(authorLogin, pullRequest.user?.type, approvedAuthors)) {
    return skip(
      `pull request was opened by ${authorLogin}, which is not a release automation identity`
    );
  }

  if (!commits?.length) return skip('pull request has no commits');

  for (const commit of commits) {
    const subject = (commit.commit?.message || '').split('\n')[0];

    if (!RELEASE_COMMIT_SUBJECT.test(subject)) {
      return skip(`commit ${commit.sha?.slice(0, 12)} is not a release commit`);
    }

    const commitAuthor = getCommitAuthorLogin(commit);

    if (commitAuthor !== authorLogin) {
      return skip(
        `commit ${commit.sha?.slice(0, 12)} was authored by ${commitAuthor || 'an unknown account'}, not ${authorLogin}`
      );
    }
  }

  const unexpected = (files || [])
    .map((file) => file.filename)
    .filter((filename) => !allowedPaths.has(filename));

  if (unexpected.length > 0) {
    return skip(
      `pull request changes files release-please does not generate: ${unexpected.slice(0, 5).join(', ')}${unexpected.length > 5 ? ` (+${unexpected.length - 5} more)` : ''}`
    );
  }

  if (!files?.length) return skip('pull request changes no files');

  return {
    approve: true,
    reason: `${files.length} generated files across ${commits.length} release commit(s)`,
  };
}

module.exports = {
  DEFAULT_APPROVED_AUTHORS,
  MANIFEST_FILE,
  RELEASE_BRANCH_PREFIX,
  RELEASE_COMMIT_SUBJECT,
  buildAllowedPaths,
  evaluateReleasePullRequest,
  getCommitAuthorLogin,
  joinPackagePath,
};
