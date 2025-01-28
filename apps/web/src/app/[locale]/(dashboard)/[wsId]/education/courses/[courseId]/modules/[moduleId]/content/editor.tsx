'use client';

import { BlockEditor } from '@/components/components/BlockEditor';
import { createClient } from '@repo/supabase/next/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ModuleContentEditor({
  courseId,
  moduleId,
}: {
  courseId: string;
  moduleId: string;
}) {
  const t = useTranslations();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<any | undefined>(undefined);

  useEffect(() => {
    getContent(courseId, moduleId).then((data) => {
      setContent(data as any);
      setLoading(false);
    });
  }, [courseId, moduleId]);

  const onSave = async (data: any) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_course_modules')
      .update({ content: data })
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.error('error', error);
    }
  };

  if (loading) {
    return <div>{t('common.loading')}...</div>;
  }

  return (
    <BlockEditor
      wsId={courseId}
      docId={moduleId}
      onSave={onSave}
      document={content as any | undefined}
    />
  );
}

const getContent = async (courseId: string, moduleId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('content')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data?.content;
};
