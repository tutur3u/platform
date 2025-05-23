'use client';

import RichTextEditor from '@/components/text-editor/editor';
import { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
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

  const onChange = (content: JSONContent) => {
    setPost(content);
    saveContenttoDB(content);
  };

  const saveContenttoDB = async (content: JSONContent) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_course_modules')
      .update({ content: content })
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.error(error);
    }
  };

  return (
    <div className="mx-auto w-full pt-2 text-slate-900 dark:text-slate-100">
      <RichTextEditor content={post} onChange={onChange} />
    </div>
  );
}
