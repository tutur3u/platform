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

  const isLoading =
    moduleGroupsQuery.isLoading ||
    moduleGroupModulesQueries.some((query) => query.isLoading);

  const invalidateModuleGroupModules = () =>
    queryClient.invalidateQueries({
      queryKey: ['workspaceCourseModuleGroupModules', resolvedWsId, courseId],
    });

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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) =>
      deleteWorkspaceCourseModuleGroup(resolvedWsId, courseId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspaceCourseModuleGroups', resolvedWsId, courseId],
      });
      invalidateModuleGroupModules();
      setActiveModuleId(null);
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
    onSuccess: () => {
      invalidateModuleGroupModules();
    },
  });

  const moveModuleMutation = useMutation({
    mutationFn: async (payload: { moduleId: string; targetGroupId: string }) =>
      updateWorkspaceCourseModule(resolvedWsId, payload.moduleId, {
        module_group_id: payload.targetGroupId,
      }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (payload: UpsertWorkspaceCourseModulePayload) =>
      createWorkspaceCourseModule(resolvedWsId, courseId, payload),
    onSuccess: () => {
      invalidateModuleGroupModules();
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: string) =>
      deleteWorkspaceCourseModule(resolvedWsId, moduleId),
    onSuccess: () => {
      invalidateModuleGroupModules();
      setActiveModuleId(null);
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
