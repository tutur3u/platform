import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';

type AdminModelsFilterQuery<T> = {
  contains(column: string, value: string[]): T;
  eq(column: string, value: boolean | string): T;
  in(column: string, value: string[]): T;
  or(filters: string): T;
};

export interface AdminAiCreditsModelFilters {
  enabled: boolean | null;
  ids: string[];
  provider: string | null;
  search: string;
  tag: string | null;
  type: string | null;
}

export function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function sanitizeIlikeTerm(value: string) {
  return value.trim().replaceAll(/[,%()]/g, '');
}

function parseIds(value: string | null) {
  if (!value) return [];

  return [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id.length <= MAX_NAME_LENGTH)
    ),
  ].slice(0, 100);
}

export function parseAdminAiCreditsModelFilters(
  searchParams: URLSearchParams
): AdminAiCreditsModelFilters {
  const enabled = searchParams.get('enabled');

  return {
    enabled: enabled === 'true' ? true : enabled === 'false' ? false : null,
    ids: parseIds(searchParams.get('ids')),
    provider: searchParams.get('provider')?.trim() || null,
    search: sanitizeIlikeTerm(
      searchParams.get('search') ?? searchParams.get('q') ?? ''
    ),
    tag: searchParams.get('tag')?.trim() || null,
    type: searchParams.get('type')?.trim() || null,
  };
}

export function applyAdminAiCreditsModelFilters<
  T extends AdminModelsFilterQuery<T>,
>(query: T, filters: AdminAiCreditsModelFilters): T {
  let nextQuery = query;

  if (filters.provider) {
    nextQuery = nextQuery.eq('provider', filters.provider);
  }

  if (filters.type && filters.type !== 'all') {
    nextQuery = nextQuery.eq('type', filters.type);
  }

  if (filters.tag) {
    nextQuery = nextQuery.contains('tags', [filters.tag]);
  }

  if (filters.ids.length > 0) {
    nextQuery = nextQuery.in('id', filters.ids);
  }

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    nextQuery = nextQuery.or(
      `id.ilike.${pattern},name.ilike.${pattern},provider.ilike.${pattern},description.ilike.${pattern}`
    );
  }

  if (filters.enabled !== null) {
    nextQuery = nextQuery.eq('is_enabled', filters.enabled);
  }

  return nextQuery;
}
