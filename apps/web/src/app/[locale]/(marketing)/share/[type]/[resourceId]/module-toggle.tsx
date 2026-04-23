'use client';

import { useMutation } from '@tanstack/react-query';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

type ModuleToggleMutationVariables = {
  checked: boolean;
  wsId: string;
  courseId: string;
  moduleId: string;
  moduleKey: string;
  mutationId: number;
};

export function ModuleToggles({
  wsId,
  courseId,
  moduleId,
  isPublished: initialIsPublished,
}: {
  wsId: string;
  courseId: string;
  moduleId: string;
  isPublished: boolean;
}) {
  const t = useTranslations();
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const activeModuleKeyRef = useRef('');
  const latestMutationIdRef = useRef(0);
  const previousModuleKeyRef = useRef('');
  const moduleKey = `${wsId}:${courseId}:${moduleId}`;
  activeModuleKeyRef.current = wsId && courseId && moduleId ? moduleKey : '';

  const saveMutation = useMutation({
    mutationFn: async ({
      checked,
      wsId,
      courseId,
      moduleId,
    }: ModuleToggleMutationVariables) =>
      updateWorkspaceCourseModule(wsId, moduleId, {
        group_id: courseId,
        is_published: checked,
      }),
    onSuccess: (_data, { checked, moduleKey, mutationId }) => {
      if (
        activeModuleKeyRef.current === moduleKey &&
        latestMutationIdRef.current === mutationId
      ) {
        setIsPublished(checked);
      }
    },
    onError: (_error, { moduleKey, mutationId }) => {
      if (
        activeModuleKeyRef.current === moduleKey &&
        latestMutationIdRef.current === mutationId
      ) {
        toast.error(t('common.error_saving_content'));
      }
    },
  });

  useEffect(() => {
    if (!wsId || !courseId || !moduleId) {
      previousModuleKeyRef.current = '';
      return;
    }

    if (previousModuleKeyRef.current !== moduleKey) {
      previousModuleKeyRef.current = moduleKey;
      setIsPublished(initialIsPublished);
    }
  }, [courseId, initialIsPublished, moduleId, moduleKey, wsId]);

  const handlePublishedChange = (checked: boolean | 'indeterminate') => {
    if (checked === 'indeterminate') {
      return;
    }

    const mutationId = latestMutationIdRef.current + 1;
    latestMutationIdRef.current = mutationId;

    saveMutation.mutate({
      checked,
      wsId,
      courseId,
      moduleId,
      moduleKey,
      mutationId,
    });
  };

  return (
    <div className="flex flex-col space-y-4 pt-4 pb-2">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="isPublished"
          checked={isPublished}
          onCheckedChange={handlePublishedChange}
          disabled={saveMutation.isPending}
        />
        <label
          htmlFor="isPublished"
          className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {t('common.published')}
        </label>
      </div>
    </div>
  );
}
