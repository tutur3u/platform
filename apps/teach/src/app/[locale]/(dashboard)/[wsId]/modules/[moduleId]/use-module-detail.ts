'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspaceCourseModule,
  createWorkspaceCourseModuleGroup,
  deleteWorkspaceCourseModule,
  deleteWorkspaceCourseModuleGroup,
  listWorkspaceCourseModuleGroups,
  listWorkspaceCourseModules,
  reorderWorkspaceCourseModuleGroups,
  reorderWorkspaceCourseModulesInModuleGroup,
  updateWorkspaceCourseModule,
  updateWorkspaceCourseModuleGroup,
} from '@tuturuuu/internal-api';
import type {
  WorkspaceCourseModule,
  WorkspaceCourseModuleGroup,
} from '@tuturuuu/types/db';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const moduleGroupsKey = (wsId: string, courseId: string) => [
  'module-groups',
  wsId,
  courseId,
];

export const modulesKey = (wsId: string, courseId: string) => [
  'course-modules',
  wsId,
  courseId,
];

// ─── Derived type ─────────────────────────────────────────────────────────────

export type ModuleGroupWithModules = WorkspaceCourseModuleGroup & {
  modules: WorkspaceCourseModule[];
};

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useModuleDetail(wsId: string, courseId: string) {
  const qc = useQueryClient();

  // Fetch module groups
  const groupsQuery = useQuery({
    enabled: Boolean(wsId) && Boolean(courseId),
    queryFn: () => listWorkspaceCourseModuleGroups(wsId, courseId),
    queryKey: moduleGroupsKey(wsId, courseId),
  });

  // Fetch all modules for the course (flat list, grouped client-side)
  const modulesQuery = useQuery({
    enabled: Boolean(wsId) && Boolean(courseId),
    queryFn: () => listWorkspaceCourseModules(wsId, courseId),
    queryKey: modulesKey(wsId, courseId),
  });

  // Build grouped structure
  const groups: ModuleGroupWithModules[] = (groupsQuery.data ?? []).map(
    (group) => ({
      ...group,
      modules: (modulesQuery.data ?? [])
        .filter((m) => m.module_group_id === group.id)
        .sort((a, b) => (a.sort_key ?? 0) - (b.sort_key ?? 0)),
    })
  );

  const isLoading = groupsQuery.isLoading || modulesQuery.isLoading;
  const isError = groupsQuery.isError || modulesQuery.isError;

  // ─── Module group mutations ─────────────────────────────────────────────────

  const createGroup = useMutation({
    mutationFn: (title: string) =>
      createWorkspaceCourseModuleGroup(wsId, courseId, { title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
    },
  });

  const renameGroup = useMutation({
    mutationFn: ({
      moduleGroupId,
      title,
    }: {
      moduleGroupId: string;
      title: string;
    }) =>
      updateWorkspaceCourseModuleGroup(wsId, courseId, moduleGroupId, {
        title,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
    },
  });

  const deleteGroup = useMutation({
    mutationFn: (moduleGroupId: string) =>
      deleteWorkspaceCourseModuleGroup(wsId, courseId, moduleGroupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  const reorderGroups = useMutation({
    mutationFn: (moduleGroupIds: string[]) =>
      reorderWorkspaceCourseModuleGroups(wsId, courseId, moduleGroupIds),
    onMutate: async (moduleGroupIds) => {
      await qc.cancelQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
      const prev = qc.getQueryData<WorkspaceCourseModuleGroup[]>(
        moduleGroupsKey(wsId, courseId)
      );
      if (prev) {
        const reordered = moduleGroupIds
          .map((id) => prev.find((g) => g.id === id))
          .filter(Boolean) as WorkspaceCourseModuleGroup[];
        qc.setQueryData(moduleGroupsKey(wsId, courseId), reordered);
      }
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(moduleGroupsKey(wsId, courseId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: moduleGroupsKey(wsId, courseId) });
    },
  });

  // ─── Module mutations ───────────────────────────────────────────────────────

  const createModule = useMutation({
    mutationFn: ({
      moduleGroupId,
      name,
    }: {
      moduleGroupId: string;
      name: string;
    }) =>
      createWorkspaceCourseModule(wsId, courseId, {
        module_group_id: moduleGroupId,
        name,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  const renameModule = useMutation({
    mutationFn: ({ moduleId, name }: { moduleId: string; name: string }) =>
      updateWorkspaceCourseModule(wsId, moduleId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  const togglePublished = useMutation({
    mutationFn: ({
      moduleId,
      is_published,
    }: {
      moduleId: string;
      is_published: boolean;
    }) => updateWorkspaceCourseModule(wsId, moduleId, { is_published }),
    onMutate: async ({ moduleId, is_published }) => {
      await qc.cancelQueries({ queryKey: modulesKey(wsId, courseId) });
      const prev = qc.getQueryData(modulesKey(wsId, courseId));
      qc.setQueryData(
        modulesKey(wsId, courseId),
        (old: WorkspaceCourseModule[] | undefined) =>
          (old ?? []).map((m) =>
            m.id === moduleId ? { ...m, is_published } : m
          )
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(modulesKey(wsId, courseId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  const deleteModule = useMutation({
    mutationFn: (moduleId: string) =>
      deleteWorkspaceCourseModule(wsId, moduleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  const reorderModules = useMutation({
    mutationFn: ({
      moduleGroupId,
      moduleIds,
    }: {
      moduleGroupId: string;
      moduleIds: string[];
    }) =>
      reorderWorkspaceCourseModulesInModuleGroup(
        wsId,
        courseId,
        moduleGroupId,
        moduleIds
      ),
    onMutate: async ({ moduleGroupId, moduleIds }) => {
      await qc.cancelQueries({ queryKey: modulesKey(wsId, courseId) });
      const prev = qc.getQueryData(modulesKey(wsId, courseId));
      qc.setQueryData(
        modulesKey(wsId, courseId),
        (old: WorkspaceCourseModule[] | undefined) => {
          if (!old) return old;
          const inGroup = old.filter(
            (m) => m.module_group_id === moduleGroupId
          );
          const outside = old.filter(
            (m) => m.module_group_id !== moduleGroupId
          );
          const reordered = moduleIds
            .map((id, index) => {
              const module = inGroup.find((m) => m.id === id);
              return module ? { ...module, sort_key: index + 1 } : null;
            })
            .filter(Boolean) as WorkspaceCourseModule[];
          return [...outside, ...reordered];
        }
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(modulesKey(wsId, courseId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: modulesKey(wsId, courseId) });
    },
  });

  return {
    groups,
    isError,
    isLoading,
    // group mutations
    createGroup,
    deleteGroup,
    reorderGroups,
    renameGroup,
    // module mutations
    createModule,
    deleteModule,
    reorderModules,
    renameModule,
    togglePublished,
  };
}
