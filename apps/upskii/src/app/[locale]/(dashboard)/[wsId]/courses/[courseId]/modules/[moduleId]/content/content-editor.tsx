'use client';

import RichTextEditor from '@/components/text-editor/editor';
import { JSONContent } from '@tiptap/react';
import { useState } from 'react';

interface Props {
  wsId: string;
  courseId: string;
  moduleId: string;
  content?: JSONContent;
}

export default function ModuleContentEditor({
  wsId,
  courseId,
  moduleId,
  content,
}: Props) {
  const [post, setPost] = useState<JSONContent | null>(content || null);

  const onChange = (content: JSONContent) => {
    setPost(content);
    console.log(content, wsId, courseId, moduleId);
  };

  return (
    <div className="mx-auto w-full py-8 text-slate-900 dark:text-slate-100">
      <RichTextEditor content={post} onChange={onChange} />
    </div>
  );
}
