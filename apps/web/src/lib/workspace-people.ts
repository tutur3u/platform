import { resolveUserDisplayName } from '@tuturuuu/utils/name-helper';

export type PeopleVisibility = {
  hideName: boolean;
  hideEmail: boolean;
  publicContacts: boolean;
  privateContacts: boolean;
};

export type PersonCandidate = {
  kind: 'contact' | 'member';
  id: string;
  display_name: string | null;
  full_name?: string | null;
  email: string | null;
  avatar_url: string | null;
};

type PersonProjection = {
  id: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
} & ({ kind: 'contact'; linkedUserId: string | null } | { kind: 'member' });

export function projectWorkspacePeople(
  candidates: PersonCandidate[],
  visibility: PeopleVisibility,
  query: string,
  limit: number
) {
  const needle = query.toLocaleLowerCase();
  const seen = new Set<string>();
  return candidates
    .flatMap<PersonProjection>((candidate) => {
      const contact = candidate.kind === 'contact';
      const displayName =
        visibility.hideName || (contact && !visibility.publicContacts)
          ? null
          : resolveUserDisplayName({
              display_name: candidate.display_name,
              full_name:
                contact && visibility.publicContacts
                  ? candidate.full_name
                  : null,
            }) || null;
      const email =
        visibility.hideEmail || (contact && !visibility.privateContacts)
          ? null
          : candidate.email;
      const key = `${candidate.kind}:${candidate.id}`;
      if (
        seen.has(key) ||
        ![displayName, email].some((value) =>
          value?.toLocaleLowerCase().includes(needle)
        )
      )
        return [];
      seen.add(key);
      const fields = {
        id: candidate.id,
        displayName,
        email,
        avatarUrl:
          contact && !visibility.publicContacts ? null : candidate.avatar_url,
      };
      return candidate.kind === 'contact'
        ? [{ ...fields, kind: 'contact' as const, linkedUserId: null }]
        : [{ ...fields, kind: 'member' as const }];
    })
    .slice(0, limit);
}

// PostgREST quoted filter values keep commas and parentheses inside the value.
export function peopleSearchPattern(query: string) {
  return `"%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll('"', '\\"')}%"`;
}

export function parsePeopleSearch(params: URLSearchParams) {
  const query = params.get('q')?.trim() ?? '';
  const limit = Number(params.get('limit') ?? 10);
  if (
    query.length < 2 ||
    query.length > 100 ||
    query.includes('*') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20
  )
    return null;
  return { query, limit };
}
