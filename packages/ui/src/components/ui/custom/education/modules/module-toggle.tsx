'use client';

import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ModuleToggles({
  wsId,
  courseId,
  moduleId,
  //   isPublic: initialIsPublic,
  isPublished: initialIsPublished,
}: {
  wsId: string;
  courseId: string;
  moduleId: string;
  isPublic: boolean;
  isPublished: boolean;
}) {
  const t = useTranslations();

  const [loading, setLoading] = useState(false);
  //   const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isPublished, setIsPublished] = useState(initialIsPublished);

  //   const handlePublicChange = async (checked: boolean) => {
  //     setLoading(true);

  //     const { error } = await supabase
  //       .from('workspace_course_modules')
  //       .update({ is_public: checked })
  //       .eq('course_id', courseId)
  //       .eq('id', moduleId);

  //     if (error) {
  //       setLoading(false);
  //       throw error;
  //     }

  //     setIsPublic(checked);
  //     setLoading(false);
  //   };

  const handlePublishedChange = async (checked: boolean) => {
    setLoading(true);
    try {
      await updateWorkspaceCourseModule(wsId, moduleId, {
        group_id: courseId,
        is_published: checked,
      });
      setIsPublished(checked);
    } catch {
      setLoading(false);
      throw new Error('Failed to update module');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col space-y-4 pt-4 pb-2">
      {/* <div className="flex items-center space-x-2">
        <Checkbox
          id="isPublic"
          checked={isPublic}
          onCheckedChange={handlePublicChange}
          disabled={loading}
        />
        <label
          htmlFor="isPublic"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Public
        </label>
      </div> */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="isPublished"
          checked={isPublished}
          onCheckedChange={handlePublishedChange}
          disabled={loading}
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
