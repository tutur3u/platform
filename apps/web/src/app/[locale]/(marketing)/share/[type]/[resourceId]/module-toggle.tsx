'use client';

import { useMutation } from '@tanstack/react-query';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

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
  const previousModuleKeyRef = useRef('');
  const moduleKey = `${wsId}:${courseId}:${moduleId}`;

  const saveMutation = useMutation({
    mutationFn: async (checked: boolean) =>
      updateWorkspaceCourseModule(wsId, moduleId, {
        group_id: courseId,
        is_published: checked,
      }),
    onSuccess: (_data, checked) => {
      setIsPublished(checked);
    },
    onError: () => {
      toast.error(t('common.error_saving_content'));
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

    saveMutation.mutate(checked);
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
