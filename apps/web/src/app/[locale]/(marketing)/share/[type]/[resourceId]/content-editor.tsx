'use client';

import { useMutation } from '@tanstack/react-query';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface Props {
  wsId: string;
  courseId: string;
  moduleId: string;
  content?: JSONContent;
}

export function ModuleContentEditor({
  wsId,
  courseId,
  moduleId,
  content,
}: Props) {
  const [post, setPost] = useState<JSONContent | null>(content || null);
  const t = useTranslations();

  useEffect(() => {
    setPost(content || null);
  }, [content]);

  const saveMutation = useMutation({
    mutationFn: async (nextContent: JSONContent | null) =>
      updateWorkspaceCourseModule(wsId, moduleId, {
        group_id: courseId,
        content: nextContent,
      }),
    onError: () => {
      toast.error(t('common.error_saving_content'));
    },
  });

  const onChange = (content: JSONContent | null) => {
    setPost(content);
    saveMutation.mutate(content);
  };

  const titlePlaceholder = t('common.whats_the_title');
  const writePlaceholder = t('common.write_something');
  const saveButtonLabel = t('common.save');
  const savedButtonLabel = t('common.saved');

  return (
    <div className="mx-auto w-full pt-2 text-slate-900 dark:text-slate-100">
      <RichTextEditor
        content={post}
        onChange={onChange}
        titlePlaceholder={titlePlaceholder}
        writePlaceholder={writePlaceholder}
        saveButtonLabel={saveButtonLabel}
        savedButtonLabel={savedButtonLabel}
      />
    </div>
  );
}
