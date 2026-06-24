'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone } from '@tuturuuu/icons';
import {
  createTopicAnnouncementTemplate,
  deleteTopicAnnouncementTemplate,
  listTopicAnnouncementTemplates,
  listWorkspaceUserGroups,
  type TopicAnnouncementTemplatePayload,
  type TopicAnnouncementTemplateRecord,
  updateTopicAnnouncementTemplate,
} from '@tuturuuu/internal-api';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { TopicAnnouncementsTemplates } from './topic-announcements-templates';

interface TopicAnnouncementsTemplatesPageClientProps {
  initialGroups: UserGroup[];
  initialTemplates: TopicAnnouncementTemplateRecord[];
  wsId: string;
}

export function TopicAnnouncementsTemplatesPageClient({
  initialGroups,
  initialTemplates,
  wsId,
}: TopicAnnouncementsTemplatesPageClientProps) {
  const t = useTranslations('ws-topic-announcements');
  const queryClient = useQueryClient();

  const templatesQueryKey = ['topic-announcement-templates', wsId] as const;
  const groupsQueryKey = ['topic-announcement-user-groups', wsId] as const;

  const templatesQuery = useQuery({
    initialData: { data: initialTemplates },
    queryFn: () => listTopicAnnouncementTemplates(wsId),
    queryKey: templatesQueryKey,
    staleTime: 30_000,
  });

  const groupsQuery = useQuery({
    initialData: {
      count: initialGroups.length,
      data: initialGroups,
      page: 1,
      pageSize: Math.max(initialGroups.length, 1),
    },
    queryFn: () =>
      listWorkspaceUserGroups(wsId, {
        page: 1,
        pageSize: 200,
        status: 'active',
      }),
    queryKey: groupsQueryKey,
    staleTime: 30_000,
  });

  const invalidateTemplateData = () => {
    void queryClient.invalidateQueries({ queryKey: templatesQueryKey });
  };

  const createTemplateMutation = useMutation({
    mutationFn: (payload: TopicAnnouncementTemplatePayload) =>
      createTopicAnnouncementTemplate(wsId, payload),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_save_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_saved'));
      invalidateTemplateData();
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({
      payload,
      templateId,
    }: {
      payload: Partial<TopicAnnouncementTemplatePayload>;
      templateId: string;
    }) => updateTopicAnnouncementTemplate(wsId, templateId, payload),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_save_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_saved'));
      invalidateTemplateData();
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) =>
      deleteTopicAnnouncementTemplate(wsId, templateId),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : t('template_delete_failed')
      ),
    onSuccess: () => {
      toast.success(t('template_deleted'));
      invalidateTemplateData();
    },
  });

  const templates = templatesQuery.data.data;
  const groups = groupsQuery.data.data;
  const isSaving =
    createTemplateMutation.isPending || updateTemplateMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue">
          <Megaphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm">{t('description')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="max-w-3xl text-muted-foreground text-sm">
              {t('templates_page_description')}
            </p>
          </div>
        </div>

        <TopicAnnouncementsTemplates
          groups={groups}
          isDeleting={deleteTemplateMutation.isPending}
          isLoading={
            (templatesQuery.isPending && templates.length === 0) ||
            (groupsQuery.isPending && groups.length === 0)
          }
          isSaving={isSaving}
          onCreate={(payload) => createTemplateMutation.mutate(payload)}
          onDelete={(templateId) => deleteTemplateMutation.mutate(templateId)}
          onUpdate={(templateId, payload) =>
            updateTemplateMutation.mutate({ payload, templateId })
          }
          templates={templates}
        />
      </div>
    </div>
  );
}
