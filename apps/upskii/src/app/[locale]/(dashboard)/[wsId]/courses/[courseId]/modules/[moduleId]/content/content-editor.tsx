'use client';

import RichTextEditor from '@/components/text-editor/editor';
import { useState } from 'react';

export default function ModuleContentEditor() {
  const [post, setPost] = useState('');

  const onChange = (content: string) => {
    setPost(content);
    console.log(content);
  };

  return (
    <div className="mx-auto w-full py-8 text-slate-900 dark:text-slate-100">
      <RichTextEditor content={post} onChange={onChange} />
    </div>
  );
}
