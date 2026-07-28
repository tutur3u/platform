import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { BOOTSTRAP_REPOSITORY } from '@/constants/common';
import { GitHubMirrorError } from './errors';
import { privateDb } from './private-db';
import type { GitRepository } from './types';

type GitRepositoryRow = {
  archived: boolean;
  default_branch: string;
  description: string | null;
  enabled: boolean;
  github_repository_id: number;
  homepage_url: string | null;
  id: string;
  name: string;
  owner_login: string;
  visibility: string;
};

function mapRepository(row: GitRepositoryRow): GitRepository {
  return {
    archived: row.archived,
    defaultBranch: row.default_branch,
    description: row.description,
    enabled: row.enabled,
    githubRepositoryId: Number(row.github_repository_id),
    homepageUrl: row.homepage_url,
    id: row.id,
    name: row.name,
    owner: row.owner_login,
    visibility: 'public',
  };
}

function isBootstrapRepository(owner: string, name: string) {
  return (
    owner.toLowerCase() === BOOTSTRAP_REPOSITORY.owner &&
    name.toLowerCase() === BOOTSTRAP_REPOSITORY.name
  );
}

export async function getRegisteredRepository(
  owner: string,
  name: string
): Promise<GitRepository | null> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await privateDb(db)
    .from('git_repositories')
    .select(
      'archived,default_branch,description,enabled,github_repository_id,homepage_url,id,name,owner_login,visibility'
    )
    .ilike('owner_login', owner)
    .ilike('name', name)
    .eq('enabled', true)
    .maybeSingle();

  if (error) {
    if (isBootstrapRepository(owner, name)) {
      return BOOTSTRAP_REPOSITORY;
    }

    console.warn('Git repository registry is unavailable');
    return null;
  }

  if (data?.visibility !== 'public') {
    return isBootstrapRepository(owner, name) ? BOOTSTRAP_REPOSITORY : null;
  }

  return mapRepository(data as GitRepositoryRow);
}

export async function requireRegisteredRepository(owner: string, name: string) {
  const repository = await getRegisteredRepository(owner, name);

  if (!repository) {
    throw new GitHubMirrorError('Repository not found', 404, 'not_registered');
  }

  return repository;
}

export async function listRegisteredRepositories(): Promise<GitRepository[]> {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await privateDb(db)
    .from('git_repositories')
    .select(
      'archived,default_branch,description,enabled,github_repository_id,homepage_url,id,name,owner_login,visibility'
    )
    .order('owner_login')
    .order('name');

  if (error) {
    return [BOOTSTRAP_REPOSITORY];
  }

  return ((data ?? []) as GitRepositoryRow[]).map(mapRepository);
}
