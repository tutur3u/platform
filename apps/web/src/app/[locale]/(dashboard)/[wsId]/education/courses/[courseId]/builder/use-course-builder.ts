'use client';

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  createWorkspaceCourseModule,
  createWorkspaceCourseModuleGroup,
  deleteWorkspaceCourseModule,
  deleteWorkspaceCourseModuleGroup,
  listWorkspaceCourseModuleGroupModules,
  listWorkspaceCourseModuleGroups,
  reorderWorkspaceCourseModuleGroups,
  reorderWorkspaceCourseModulesInModuleGroup,
  type UpsertWorkspaceCourseModuleGroupPayload,
  type UpsertWorkspaceCourseModulePayload,
  updateWorkspaceCourseModule,
  updateWorkspaceCourseModuleGroup,
} from '@tuturuuu/internal-api';
import type { WorkspaceCourseBuilderModule } from '@tuturuuu/types/db';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface UseCourseBuilderParams {
  courseId: string;
  resolvedWsId: string;
}

function hasRichContent(content: unknown) {
  if (!content || typeof content !== 'object') return false;
  const candidate = content as {
    content?: Array<{ content?: unknown[]; type?: string }>;
  };
  return (candidate.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

export function useCourseBuilder({
  courseId,
  resolvedWsId,
}: UseCourseBuilderParams) {
  const queryClient = useQueryClient();
  const t = useTranslations('ws-course-modules');

  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);

  const moduleGroupsQuery = useQuery({
    queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
    queryFn: async () =>
      listWorkspaceCourseModuleGroups(resolvedWsId, courseId),
  });

  const moduleGroups = moduleGroupsQuery.data ?? [];
  const moduleGroupModulesQueries = useQueries({
    queries: moduleGroups.map((group) => ({
      queryKey: [
        'workspaceCourseModuleGroupModules',
        resolvedWsId,
        courseId,
        group.id,
      ],
      queryFn: async () =>
        listWorkspaceCourseModuleGroupModules(resolvedWsId, courseId, group.id),
      enabled: moduleGroupsQuery.isSuccess,
    })),
  });

  const modulesByGroupId = useMemo(() => {
    const map = new Map<string, WorkspaceCourseBuilderModule[]>();
    moduleGroups.forEach((group, index) => {
      map.set(group.id, moduleGroupModulesQueries[index]?.data ?? []);
    });
    return map;
  }, [moduleGroupModulesQueries, moduleGroups]);

  const modules = useMemo(() => {
    const nextModules: WorkspaceCourseBuilderModule[] = [];
    for (const group of moduleGroups) {
      nextModules.push(...(modulesByGroupId.get(group.id) ?? []));
    }
    return nextModules;
  }, [moduleGroups, modulesByGroupId]);

  const activeModule = useMemo(
    () => modules.find((module) => module.id === activeModuleId) ?? null,
    [activeModuleId, modules]
  );

  const totalModules = modules.length;
  const publishedModules = modules.filter(
    (module) => module.is_published
  ).length;
  const modulesWithContent = modules.filter((module) =>
    hasRichContent(module.content)
  ).length;
  const modulesWithAssessments = modules.filter(
    (module) =>
      module.quiz_count > 0 ||
      module.quiz_set_count > 0 ||
      module.flashcard_count > 0
  ).length;

  const isLoading = moduleGroupsQuery.isLoading;

  const invalidateModuleGroupModules = (
    ...groupIds: Array<string | null | undefined>
  ) => {
    const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))] as string[];

    return Promise.all(
      uniqueGroupIds.map((groupId) =>
        queryClient.invalidateQueries({
          queryKey: [
            'workspaceCourseModuleGroupModules',
            resolvedWsId,
            courseId,
            groupId,
          ],
        })
      )
    );
  };

  const upsertGroupMutation = useMutation({
    mutationFn: async (payload: {
      id?: string;
      data: UpsertWorkspaceCourseModuleGroupPayload;
    }) => {
      if (payload.id) {
        return updateWorkspaceCourseModuleGroup(
          resolvedWsId,
          courseId,
          payload.id,
          payload.data
        );
      }

      return createWorkspaceCourseModuleGroup(
        resolvedWsId,
        courseId,
        payload.data
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
      });
      toast.success(variables.id ? t('group_updated') : t('group_created'));
    },
    onError: () => {
      toast.error(t('group_save_error'));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) =>
      deleteWorkspaceCourseModuleGroup(resolvedWsId, courseId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
      });
      void invalidateModuleGroupModules(
        ...moduleGroups.map((group) => group.id)
      );
      setActiveModuleId(null);
      toast.success(t('group_deleted'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: async (moduleGroupIds: string[]) =>
      reorderWorkspaceCourseModuleGroups(
        resolvedWsId,
        courseId,
        moduleGroupIds
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
      });
      toast.success(t('groups_reordered'));
    },
    onError: () => {
      toast.error(t('reorder_failed'));
    },
  });

  const reorderModulesMutation = useMutation({
    mutationFn: async (payload: {
      moduleGroupId: string;
      moduleIds: string[];
    }) =>
      reorderWorkspaceCourseModulesInModuleGroup(
        resolvedWsId,
        courseId,
        payload.moduleGroupId,
        payload.moduleIds
      ),
    onSuccess: (_data, variables) => {
      void invalidateModuleGroupModules(variables.moduleGroupId);
      toast.success(t('modules_reordered'));
    },
    onError: () => {
      toast.error(t('reorder_failed'));
    },
  });

  const moveModuleMutation = useMutation({
    mutationFn: async (payload: {
      moduleId: string;
      sourceGroupId: string;
      targetGroupId: string;
    }) =>
      updateWorkspaceCourseModule(resolvedWsId, payload.moduleId, {
        module_group_id: payload.targetGroupId,
      }),
    onSuccess: (_data, variables) => {
      void invalidateModuleGroupModules(
        variables.sourceGroupId,
        variables.targetGroupId
      );
      toast.success(t('module_moved'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (payload: UpsertWorkspaceCourseModulePayload) =>
      createWorkspaceCourseModule(resolvedWsId, courseId, payload),
    onSuccess: (_data, variables) => {
      void invalidateModuleGroupModules(variables.module_group_id);
      toast.success(t('module_duplicated'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (payload: { moduleGroupId: string; moduleId: string }) =>
      deleteWorkspaceCourseModule(resolvedWsId, payload.moduleId),
    onSuccess: (_data, variables) => {
      void invalidateModuleGroupModules(variables.moduleGroupId);
      setActiveModuleId(null);
      toast.success(t('module_deleted'));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  return {
    activeModule,
    deleteGroupMutation,
    deleteModuleMutation,
    duplicateMutation,
    invalidateModuleGroupModules,
    isLoading,
    moduleGroups,
    modulesByGroupId,
    modulesWithAssessments,
    modulesWithContent,
    moveModuleMutation,
    publishedModules,
    reorderGroupsMutation,
    reorderModulesMutation,
    setActiveModuleId,
    totalModules,
    upsertGroupMutation,
  } as const;
}
