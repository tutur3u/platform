'use client';

import { BlockEditor } from '@/components/components/BlockEditor';
import { createClient } from '@tutur3u/supabase/next/client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ModuleExtraContentEditor({
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
    getExtraContent(courseId, moduleId).then((data) => {
      setContent(data as any);
      setLoading(false);
    });
  }, [courseId, moduleId]);

  const onSave = async (data: any) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_course_modules')
      .update({ extra_content: data })
      .eq('id', moduleId)
      .eq('course_id', courseId);

    if (error) {
      console.error('error', error);
    }
  };

  if (loading) {
    return <div>{t('common.loading')}...</div>;
  }

  return <BlockEditor document={content as any | undefined} onSave={onSave} />;
}

const getExtraContent = async (courseId: string, moduleId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('extra_content')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data?.extra_content;
};
