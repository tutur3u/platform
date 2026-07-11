const DEFAULT_REPOSITORY = 'ghcr.io/tutur3u/platform-e2e';
const DEFAULT_STALE_HOURS = 24;
const DEFAULT_DELETE_ATTEMPTS = 3;
const BUNDLE_TAG_PATTERN =
  /^\d+-\d+-[0-9a-f]{7,40}-(?:[a-z0-9][a-z0-9.-]*|ready)$/u;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateRepository(repository) {
  const normalized = String(repository ?? '')
    .trim()
    .toLowerCase();

  if (
    !/^ghcr\.io\/[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9_.-]*[a-z0-9])?$/u.test(
      normalized
    )
  ) {
    throw new Error(
      'E2E image bundle repository must be a two-segment ghcr.io repository.'
    );
  }

  return normalized;
}

function parsePackageRepository(repository) {
  const [, owner, packageName] = validateRepository(repository).split('/');
  return { owner, packageName };
}

async function githubRequest(
  pathname,
  { env = process.env, method = 'GET', token = env.GITHUB_TOKEN } = {}
) {
  if (!token) throw new Error('GITHUB_TOKEN is required for GHCR cleanup.');

  const response = await fetch(
    `${env.GITHUB_API_URL ?? 'https://api.github.com'}${pathname}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      method,
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${pathname} failed (${response.status}).`
    );
  }

  return response.status === 204 ? null : response.json();
}

async function verifyPackageVisibility(
  repository,
  env = process.env,
  request = githubRequest
) {
  const { owner, packageName } = parsePackageRepository(repository);
  const packageInfo = await request(
    `/orgs/${owner}/packages/container/${encodeURIComponent(packageName)}`,
    { env }
  );

  if (packageInfo?.visibility !== 'private') {
    throw new Error('The E2E GHCR package must exist and remain private.');
  }
}

async function listPackageVersions(
  repository,
  env = process.env,
  request = githubRequest
) {
  const { owner, packageName } = parsePackageRepository(repository);
  const versions = [];

  for (let page = 1; ; page += 1) {
    const result = await request(
      `/orgs/${owner}/packages/container/${encodeURIComponent(
        packageName
      )}/versions?per_page=100&page=${page}`,
      { env }
    );

    if (!result) return [];
    versions.push(...result);
    if (result.length < 100) return versions;
  }
}

function selectPackageVersions(
  versions,
  { now = Date.now(), staleHours, tagPrefix } = {}
) {
  const staleBefore = staleHours ? now - staleHours * 60 * 60 * 1000 : null;

  return versions.filter((version) => {
    const tags = version.metadata?.container?.tags ?? [];

    if (tagPrefix) {
      return tags.some((tag) => tag.startsWith(`${tagPrefix}-`));
    }

    if (staleBefore == null) return false;
    const createdAt = Date.parse(version.created_at ?? '');
    const bundleOnly =
      tags.length === 0 || tags.every((tag) => BUNDLE_TAG_PATTERN.test(tag));
    return bundleOnly && Number.isFinite(createdAt) && createdAt < staleBefore;
  });
}

async function deletePackageVersion(
  repository,
  versionId,
  {
    attempts = DEFAULT_DELETE_ATTEMPTS,
    env = process.env,
    request = githubRequest,
    sleep: sleepImpl = sleep,
  } = {}
) {
  const { owner, packageName } = parsePackageRepository(repository);
  const pathname = `/orgs/${owner}/packages/container/${encodeURIComponent(
    packageName
  )}/versions/${versionId}`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await request(pathname, { env, method: 'DELETE' });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleepImpl(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

async function cleanupBundle(
  options,
  {
    env = process.env,
    listVersions = listPackageVersions,
    removeVersion = deletePackageVersion,
  } = {}
) {
  const versions = await listVersions(options.repository, env);
  const selected = selectPackageVersions(versions, options);

  for (const version of selected) {
    await removeVersion(options.repository, version.id, { env });
  }

  process.stdout.write(
    `Deleted ${selected.length} E2E GHCR package versions.\n`
  );
  return selected;
}

module.exports = {
  BUNDLE_TAG_PATTERN,
  DEFAULT_REPOSITORY,
  DEFAULT_STALE_HOURS,
  cleanupBundle,
  deletePackageVersion,
  githubRequest,
  listPackageVersions,
  parsePackageRepository,
  selectPackageVersions,
  validateRepository,
  verifyPackageVisibility,
};
