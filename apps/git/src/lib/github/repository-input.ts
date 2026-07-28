const OWNER_PATTERN = /^[A-Za-z0-9-]{1,39}$/u;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/u;

export function normalizeRepositoryInput(value: string) {
  const normalized = value.trim();
  const url = normalized.startsWith('http')
    ? new URL(normalized)
    : new URL(`https://github.com/${normalized}`);

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Only github.com repositories are supported');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new Error('Enter a valid GitHub owner/repository');
  }

  const owner = segments[0] ?? '';
  const name = (segments[1] ?? '').replace(/\.git$/u, '');
  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(name)) {
    throw new Error('Enter a valid GitHub owner/repository');
  }

  return { name, owner };
}
