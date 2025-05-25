'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { JSONContent } from '@tuturuuu/ui/tiptap';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  courseId: string;
  moduleId: string;
  content?: JSONContent;
}

export default function ModuleContentEditor({
  courseId,
  moduleId,
  content,
}: Props) {
  const [post, setPost] = useState<JSONContent | null>(content || null);
  const t = useTranslations();

  const onChange = (content: JSONContent) => {
    setPost(content);
    saveContentToDB(content);
  };

  const saveContentToDB = async (content: JSONContent) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_course_modules')
      .update({ content: content })
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.log(error);
      toast.error(t('common.error_saving_content'));
    }
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
