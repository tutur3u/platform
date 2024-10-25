import { TailwindAdvancedEditor } from '../../../../../documents/advanced-editor';
import { CourseSection } from '../../section';
import { WorkspaceCourseModule } from '@/types/db';
import { createClient } from '@/utils/supabase/server';
import {
  BookText,
  Goal,
  ListTodo,
  Paperclip,
  SwatchBook,
  Youtube,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { JSONContent } from 'novel';

interface Props {
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  const t = await getTranslations();
  const { courseId, moduleId } = await params;
  const data = await getModuleData(courseId, moduleId);

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_content')}
        icon={<Goal className="h-5 w-5" />}
        rawContent={data.content as JSONContent | undefined}
        content={
          <TailwindAdvancedEditor
            content={data.content as JSONContent | undefined}
            disableLocalStorage
            previewMode
          />
        }
      />
      <CourseSection
        title={t('course-details-tabs.resources')}
        icon={<Paperclip className="h-5 w-5" />}
      />
      <CourseSection
        title={t('course-details-tabs.youtube_links')}
        icon={<Youtube className="h-5 w-5" />}
      />
      <CourseSection
        title={t('ws-quizzes.plural')}
        icon={<ListTodo className="h-5 w-5" />}
      />
      <CourseSection
        title={t('ws-flashcards.plural')}
        icon={<SwatchBook className="h-5 w-5" />}
      />
      <CourseSection
        title={t('course-details-tabs.extra_reading')}
        icon={<BookText className="h-5 w-5" />}
        rawContent={data.extra_content as JSONContent | undefined}
        content={
          <TailwindAdvancedEditor
            content={data.extra_content as JSONContent | undefined}
            disableLocalStorage
            previewMode
          />
        }
      />
    </div>
  );
}

const getModuleData = async (courseId: string, moduleId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('*')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data as WorkspaceCourseModule;
};
