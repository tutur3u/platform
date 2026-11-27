'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Folder } from '@tuturuuu/icons';
import type { WorkspaceStorageListItem } from '@tuturuuu/internal-api/storage';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  loadPersonalDrive,
  type PersonalTabSnapshot,
  type PersonalToolsApi,
  type PersonalToolsSnapshot,
  personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from '../../lib/personal-tools';
import {
  PersonalAppLinkButton,
  PersonalSearchInput,
  resolveSafePersonalAppUrl,
} from './shared';

function isDriveFolder(item: WorkspaceStorageListItem): boolean {
  return !item.id && !item.metadata?.mimetype && !item.metadata?.mimeType;
}

export function PersonalDriveTab({
  accountId,
  workspace,
  active,
  api = personalToolsApi,
}: {
  accountId: string;
  workspace: PersonalToolsSnapshot['workspace'];
  active: boolean;
  api?: PersonalToolsApi;
}) {
  const t = useTranslations('meet.call.private_tools');
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const queryKey = [
    'meet-personal-tools',
    accountId,
    workspace.id,
    'drive',
  ] as const;

  const query = useQuery({
    queryKey,
    enabled: active,
    queryFn: () =>
      loadPersonalDrive(
        accountId,
        workspace.id,
        api,
        cache.getQueryData<PersonalTabSnapshot<WorkspaceStorageListItem[]>>(
          queryKey
        )
      ),
    staleTime: 30_000,
    refetchInterval: active ? 60_000 : false,
    retry: false,
  });

  const snapshot =
    query.isError && !personalToolsFailureKeepsSnapshot(query.error)
      ? null
      : query.data;
  const href = resolveSafePersonalAppUrl('drive', workspace);

  const filtered = useMemo(() => {
    const items = snapshot?.items;
    if (!items) return null;
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.name.toLowerCase().includes(term));
  }, [search, snapshot?.items]);

  return (
    <div>
      <PersonalAppLinkButton href={href} label={t('open_drive')} />
      <PersonalSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('search_drive_placeholder')}
      />
      {query.isPending ? (
        <LoadingRegion srLabel={t('loading_tab')} className="space-y-2">
          <SkeletonList rows={3} withAvatar={false} />
        </LoadingRegion>
      ) : !snapshot || snapshot.status === 'unavailable' || !filtered ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('tab_unavailable')}
        </p>
      ) : (
        <>
          {snapshot.status === 'stale' && (
            <p role="status" className="mb-2 text-muted-foreground text-xs">
              {t('stale_drive')}
            </p>
          )}
          {!snapshot.items?.length ? (
            <p className="text-muted-foreground text-sm">{t('empty_drive')}</p>
          ) : !filtered.length ? (
            <p className="text-muted-foreground text-sm">{t('no_matches')}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((item) => {
                const folder = isDriveFolder(item);
                const Icon = folder ? Folder : FileText;
                return (
                  <li
                    key={item.id ?? `folder:${item.name}`}
                    className="flex items-start gap-2 rounded-lg px-2 py-2.5"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm">{item.name}</p>
                      {folder && (
                        <p className="mt-0.5 text-muted-foreground text-xs">
                          {t('folder')}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
