'use client';

import { TailwindAdvancedEditor } from '../../../../documents/advanced-editor';
import { createClient } from '@/utils/supabase/client';
import { useTranslations } from 'next-intl';
import { JSONContent } from 'novel';
import { useEffect, useState } from 'react';

export function ModuleObjectivesEditor({
  wsId,
  courseId,
}: {
  wsId: string;
  courseId: string;
}) {
  const t = useTranslations();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<JSONContent | undefined>(undefined);

  useEffect(() => {
    getObjectivesContent(wsId, courseId).then((data) => {
      setContent(data as JSONContent);
      setLoading(false);
    });
  }, [wsId, courseId]);

  const onSave = async (data: JSONContent) => {
    const supabase = createClient();

    const { error } = await supabase
      .from('workspace_courses')
      .update({ objectives: data })
      .eq('id', courseId)
      .eq('ws_id', wsId);

    if (error) {
      console.error('error', error);
    }
  };

  if (loading) {
    return <div>{t('common.loading')}...</div>;
  }

  return (
    <>
      <TailwindAdvancedEditor
        content={content as JSONContent | undefined}
        onSave={onSave}
        disableLocalStorage
      />
    </>
  );
}

const getObjectivesContent = async (wsId: string, courseId: string) => {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_courses')
    .select('objectives')
    .eq('id', courseId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data?.objectives;
};
