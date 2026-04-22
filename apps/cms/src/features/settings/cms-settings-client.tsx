'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importWorkspaceExternalProjectContent } from '@tuturuuu/internal-api';
import type { WorkspaceExternalProjectBinding } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CmsSettingsSection } from '@/features/cms-studio/cms-library-section';
import {
  getCmsCollectionPath,
  getCmsLibraryPath,
} from '@/features/cms-studio/cms-paths';
import type { CmsStrings } from '@/features/cms-studio/cms-strings';
import {
  getCmsStudioQueryKey,
  useCmsStudio,
} from '@/features/cms-studio/use-cms-studio';
import { CmsMembersSection } from './cms-members-section';

type CmsSettingsClientProps = {
  binding: WorkspaceExternalProjectBinding;
  canManageMembers: boolean;
  canManageRoles: boolean;
  strings: CmsStrings;
  workspaceId: string;
};

export function CmsSettingsClient({
  binding,
  canManageMembers,
  canManageRoles,
  strings,
  workspaceId,
}: CmsSettingsClientProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations();
  const tSettings = useTranslations('external-projects.settings');
  const studioQuery = useCmsStudio({ workspaceId });

  const studio = studioQuery.data;
  const collections = studio?.collections ?? [];
  const entries = studio?.entries ?? [];
  const publishEvents = studio?.publishEvents ?? [];
  const counts = {
    archived: entries.filter((entry) => entry.status === 'archived').length,
    collections: collections.length,
    drafts: entries.filter((entry) => entry.status === 'draft').length,
    entries: entries.length,
    published: entries.filter((entry) => entry.status === 'published').length,
    scheduled: entries.filter((entry) => entry.status === 'scheduled').length,
  };

  const importMutation = useMutation({
    mutationFn: async () => importWorkspaceExternalProjectContent(workspaceId),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('common.error')),
    onSuccess: () => {
      toast.success(strings.importAction);
      queryClient.invalidateQueries({
        queryKey: getCmsStudioQueryKey(workspaceId),
      });
    },
  });

  return (
    <div className="space-y-6 pb-8">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.06),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.88))] shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5 p-6 lg:p-8">
          <div className="space-y-3">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {t('common.settings')}
            </Badge>
            <div className="space-y-2">
              <h1 className="font-semibold text-3xl tracking-tight">
                {tSettings('title')}
              </h1>
              <p className="max-w-3xl text-muted-foreground text-sm leading-6">
                {tSettings('description')}
              </p>
            </div>
          </div>

          <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
            <Card className="border-border/70 bg-background/80 shadow-none">
              <CardContent className="p-4">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {tSettings('bound_project_label')}
                </div>
                <div className="mt-2 font-semibold text-lg">
                  {binding.canonical_project?.display_name ??
                    strings.unboundLabel}
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-background/80 shadow-none">
              <CardContent className="p-4">
                <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {tSettings('member_access_label')}
                </div>
                <div className="mt-2 font-semibold text-lg">
                  {canManageMembers
                    ? tSettings('member_access_managed')
                    : tSettings('member_access_read_only')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <CmsSettingsSection
          binding={binding}
          collections={collections}
          counts={counts}
          entries={entries}
          importPending={importMutation.isPending || studioQuery.isPending}
          onCreateCollection={() => router.push(getCmsLibraryPath(pathname))}
          onDeleteCollection={(collectionId) =>
            router.push(getCmsCollectionPath(pathname, collectionId))
          }
          onImport={() => importMutation.mutate()}
          onOpenCollection={(collectionId) =>
            router.push(getCmsCollectionPath(pathname, collectionId))
          }
          onSelectCollection={(collectionId) =>
            router.push(getCmsCollectionPath(pathname, collectionId))
          }
          onShowEntries={() => router.push(getCmsLibraryPath(pathname))}
          publishEvents={publishEvents}
          strings={strings}
        />

        <div className="space-y-6">
          <CmsMembersSection
            canManageMembers={canManageMembers}
            canManageRoles={canManageRoles}
            workspaceId={workspaceId}
          />
        </div>
      </div>
    </div>
  );
}
