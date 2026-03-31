'use client';

import {
  type DatabaseGroupMembership,
  type DatabaseLinkStatus,
  DEFAULT_DATABASE_GROUP_MEMBERSHIP,
  DEFAULT_DATABASE_LINK_STATUS,
  parseDatabaseGroupMembership,
  parseDatabaseLinkStatus,
} from '@/lib/users-database-filters';

export type UsersDatabaseStatus =
  | 'active'
  | 'archived'
  | 'archived_until'
  | 'all';

export type UsersDatabaseRequireAttention = 'all' | 'true' | 'false';

export interface UsersDatabaseFilters {
  q?: string | null;
  includedGroups?: string[] | null;
  excludedGroups?: string[] | null;
  status?: string | null;
  linkStatus?: string | null;
  requireAttention?: string | null;
  groupMembership?: string | null;
}

export interface ResolveUsersDatabaseFiltersInput extends UsersDatabaseFilters {
  defaultExcludedGroups?: string[] | null;
  hasAppliedDefaultExcludedGroups?: boolean;
  defaultLinkStatus?: DatabaseLinkStatus;
  defaultGroupMembership?: DatabaseGroupMembership;
}

export interface ResolvedUsersDatabaseFilters {
  q: string;
  includedGroups: string[];
  excludedGroups: string[];
  status: UsersDatabaseStatus;
  linkStatus: DatabaseLinkStatus;
  requireAttention: UsersDatabaseRequireAttention;
  groupMembership: DatabaseGroupMembership;
}

export function parseUsersDatabaseStatus(
  value?: string | null
): UsersDatabaseStatus {
  switch (value) {
    case 'archived':
    case 'archived_until':
    case 'all':
      return value;
    default:
      return 'active';
  }
}

export function parseUsersDatabaseRequireAttention(
  value?: string | null
): UsersDatabaseRequireAttention {
  switch (value) {
    case 'true':
    case 'false':
      return value;
    default:
      return 'all';
  }
}

export function resolveUsersDatabaseFilters({
  q,
  includedGroups,
  excludedGroups,
  status,
  linkStatus,
  requireAttention,
  groupMembership,
  defaultExcludedGroups,
  hasAppliedDefaultExcludedGroups = false,
  defaultLinkStatus = DEFAULT_DATABASE_LINK_STATUS,
  defaultGroupMembership = DEFAULT_DATABASE_GROUP_MEMBERSHIP,
}: ResolveUsersDatabaseFiltersInput): ResolvedUsersDatabaseFilters {
  return {
    q: (q ?? '').trim(),
    includedGroups: normalizeStringArray(includedGroups),
    excludedGroups: normalizeStringArray(
      excludedGroups ??
        (hasAppliedDefaultExcludedGroups ? [] : (defaultExcludedGroups ?? []))
    ),
    status: parseUsersDatabaseStatus(status),
    linkStatus: parseDatabaseLinkStatus(linkStatus, defaultLinkStatus),
    requireAttention: parseUsersDatabaseRequireAttention(requireAttention),
    groupMembership: parseDatabaseGroupMembership(
      groupMembership,
      defaultGroupMembership
    ),
  };
}

export function buildWorkspaceUsersSearchParams(
  filters: ResolvedUsersDatabaseFilters & {
    page: number;
    pageSize: number;
    withPromotions?: boolean;
  }
) {
  const searchParams = new URLSearchParams();

  if (filters.q) {
    searchParams.set('q', filters.q);
  }

  searchParams.set('page', String(filters.page));
  searchParams.set('pageSize', String(filters.pageSize));
  searchParams.set('status', filters.status);
  searchParams.set('linkStatus', filters.linkStatus);
  searchParams.set('requireAttention', filters.requireAttention);
  searchParams.set('groupMembership', filters.groupMembership);

  if (filters.withPromotions) {
    searchParams.set('withPromotions', 'true');
  }

  for (const group of filters.includedGroups) {
    searchParams.append('includedGroups', group);
  }

  for (const group of filters.excludedGroups) {
    searchParams.append('excludedGroups', group);
  }

  return searchParams;
}

function normalizeStringArray(values?: string[] | string | null) {
  if (!values) {
    return [];
  }

  const normalized = Array.isArray(values) ? values : [values];

  return [...new Set(normalized.map((value) => value.trim()).filter(Boolean))];
}
