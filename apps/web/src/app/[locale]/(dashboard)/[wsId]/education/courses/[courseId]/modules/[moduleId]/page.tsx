import { TailwindAdvancedEditor } from '../../../../../documents/advanced-editor';
import { CourseSection } from '../../section';
import { WorkspaceCourse } from '@/types/db';
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
  }>;
}

export default async function UserGroupDetailsPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId, courseId } = await params;
  const course = await getCourseData(wsId, courseId);

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_objectives')}
        icon={<Goal className="h-5 w-5" />}
        rawContent={course.objectives as JSONContent | undefined}
        content={
          <TailwindAdvancedEditor
            content={course.objectives as JSONContent | undefined}
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
        rawContent={course.extra_content as JSONContent | undefined}
        content={
          <TailwindAdvancedEditor
            content={course.extra_content as JSONContent | undefined}
            disableLocalStorage
            previewMode
          />
        }
      />
    </div>
  );
}

const getCourseData = async (wsId: string, courseId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_courses')
    .select('*')
    .eq('id', courseId)
    .eq('ws_id', wsId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data as WorkspaceCourse;
};
