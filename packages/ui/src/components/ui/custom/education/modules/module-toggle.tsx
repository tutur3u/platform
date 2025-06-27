'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

export function ModuleToggles({
  courseId,
  moduleId,
  //   isPublic: initialIsPublic,
  isPublished: initialIsPublished,
}: {
  courseId: string;
  moduleId: string;
  isPublic: boolean;
  isPublished: boolean;
}) {
  const t = useTranslations();
  const supabase = createClient();

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
    const { error } = await supabase
      .from('workspace_course_modules')
      .update({ is_published: checked })
      .eq('course_id', courseId)
      .eq('id', moduleId);

    if (error) {
      setLoading(false);
      throw error;
    }

    setIsPublished(checked);
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
          id={useId()}
          checked={isPublished}
          onCheckedChange={handlePublishedChange}
          disabled={loading}
        />
        <label
          htmlFor="isPublished"
          className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {t('common.published')}
        </label>
      </div>
    </div>
  );
}
