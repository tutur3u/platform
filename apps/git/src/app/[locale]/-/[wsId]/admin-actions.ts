'use server';

import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { GITHUB_API_VERSION } from '@/constants/common';
import { requireGitAdmin } from '@/lib/admin-access';
import {
  getGitAppConfigurationStatus,
  getInstallationToken,
  recordGitAuditEvent,
  saveGitAppConfiguration,
  updateGitAppValidation,
} from '@/lib/github/credentials';
import { getSafeGitHubErrorMessage } from '@/lib/github/errors';
import { privateDb } from '@/lib/github/private-db';
import { normalizeRepositoryInput } from '@/lib/github/repository-input';

type GitHubRepositoryResponse = {
  archived: boolean;
  default_branch: string;
  description: string | null;
  homepage: string | null;
  id: number;
  name: string;
  owner: { login: string };
  private: boolean;
  visibility: string;
};

function adminPath(
  wsId: string,
  section: string,
  params: Record<string, string>
) {
  const path = new URLSearchParams(params);
  return `/-/${wsId}/${section}?${path.toString()}`;
}

async function fetchRepository(
  owner: string,
  name: string,
  token?: string | null
) {
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub returned status ${response.status}`);
  }

  return (await response.json()) as GitHubRepositoryResponse;
}

export async function saveConfigurationAction(
  wsId: string,
  formData: FormData
) {
  let destination = adminPath(wsId, 'github-app', {
    error: 'Unable to save configuration',
  });

  try {
    const admin = await requireGitAdmin();
    if (!admin) redirect('/login');
    await saveGitAppConfiguration({
      appId: String(formData.get('appId') ?? '').trim(),
      enabled: formData.get('enabled') === 'on',
      installationId: String(formData.get('installationId') ?? '').trim(),
      privateKey: String(formData.get('privateKey') ?? ''),
      userId: admin.user.id,
    });
    await recordGitAuditEvent({
      eventType: 'configuration.saved',
      metadata: { privateKeyUpdated: Boolean(formData.get('privateKey')) },
      userId: admin.user.id,
    });
    destination = adminPath(wsId, 'github-app', { saved: '1' });
  } catch (error) {
    destination = adminPath(wsId, 'github-app', {
      error: getSafeGitHubErrorMessage(error),
    });
  }

  redirect(destination);
}

export async function validateConfigurationAction(wsId: string) {
  const admin = await requireGitAdmin();
  if (!admin) redirect('/login');

  let destination = adminPath(wsId, 'github-app', {
    error: 'Unable to validate configuration',
  });

  try {
    const token = await getInstallationToken(536896722);
    if (!token) throw new Error('Enable and save the GitHub App first');
    await fetchRepository('tutur3u', 'platform', token);
    const validatedAt = new Date().toISOString();
    await updateGitAppValidation({ errorMessage: null, validatedAt });
    await recordGitAuditEvent({
      eventType: 'configuration.validated',
      metadata: { repository: 'tutur3u/platform', validatedAt },
      userId: admin.user.id,
    });
    destination = adminPath(wsId, 'github-app', { validated: '1' });
  } catch (error) {
    const message = getSafeGitHubErrorMessage(error);
    await updateGitAppValidation({
      errorMessage: message,
      validatedAt: null,
    }).catch(() => undefined);
    destination = adminPath(wsId, 'github-app', { error: message });
  }

  redirect(destination);
}

export async function registerRepositoryAction(
  wsId: string,
  formData: FormData
) {
  let destination = adminPath(wsId, 'repositories', {
    error: 'Unable to register repository',
  });

  try {
    const admin = await requireGitAdmin();
    if (!admin) redirect('/login');
    const { name, owner } = normalizeRepositoryInput(
      String(formData.get('repository') ?? '')
    );
    const publicMetadata = await fetchRepository(owner, name);
    if (publicMetadata.private || publicMetadata.visibility !== 'public') {
      throw new Error('Only public repositories can be registered');
    }

    const configuration = await getGitAppConfigurationStatus();
    if (!configuration.enabled) {
      throw new Error('Configure and enable the GitHub App first');
    }
    const token = await getInstallationToken(publicMetadata.id);
    if (!token)
      throw new Error('Repository is not available to the installation');
    await fetchRepository(owner, name, token);

    const { data, error } = await privateDb(admin.db)
      .from('git_repositories')
      .upsert(
        {
          archived: publicMetadata.archived,
          created_by: admin.user.id,
          default_branch: publicMetadata.default_branch,
          description: publicMetadata.description,
          enabled: true,
          github_repository_id: publicMetadata.id,
          homepage_url: publicMetadata.homepage,
          last_synced_at: new Date().toISOString(),
          name: publicMetadata.name,
          owner_login: publicMetadata.owner.login,
          updated_at: new Date().toISOString(),
          updated_by: admin.user.id,
          visibility: 'public',
        },
        { onConflict: 'github_repository_id' }
      )
      .select('id')
      .single();

    if (error) throw new Error('Failed to save repository');
    await recordGitAuditEvent({
      eventType: 'repository.registered',
      metadata: {
        repository: `${publicMetadata.owner.login}/${publicMetadata.name}`,
      },
      repositoryId: data.id,
      userId: admin.user.id,
    });
    revalidateTag(
      `git:${publicMetadata.owner.login.toLowerCase()}/${publicMetadata.name.toLowerCase()}`,
      'max'
    );
    destination = adminPath(wsId, 'repositories', { added: '1' });
  } catch (error) {
    destination = adminPath(wsId, 'repositories', {
      error:
        error instanceof Error
          ? error.message
          : 'Unable to register repository',
    });
  }

  redirect(destination);
}

export async function toggleRepositoryAction(
  wsId: string,
  repositoryId: string,
  enabled: boolean
) {
  const admin = await requireGitAdmin();
  if (!admin) redirect('/login');

  let destination = adminPath(wsId, 'repositories', {
    error: 'Unable to update repository',
  });

  try {
    const { data, error } = await privateDb(admin.db)
      .from('git_repositories')
      .update({
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: admin.user.id,
      })
      .eq('id', repositoryId)
      .select('id,name,owner_login')
      .single();

    if (error) throw error;
    if (!data) throw new Error('Repository update failed');

    await recordGitAuditEvent({
      eventType: enabled ? 'repository.enabled' : 'repository.disabled',
      repositoryId: data.id,
      userId: admin.user.id,
    }).catch(() => undefined);
    revalidateTag(
      `git:${String(data.owner_login).toLowerCase()}/${String(data.name).toLowerCase()}`,
      'max'
    );
    destination = adminPath(wsId, 'repositories', { updated: '1' });
  } catch (error) {
    console.error('Failed to update Git repository state', error);
  }

  redirect(destination);
}
