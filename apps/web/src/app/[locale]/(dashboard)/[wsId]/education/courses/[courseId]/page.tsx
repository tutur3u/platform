// interface Props {
//   params: Promise<{
//     locale: string;
//     wsId: string;
//     courseId: string;
//   }>;
// }
import CourseSection from './section';
import {
  BookText,
  Goal,
  ListTodo,
  Paperclip,
  SwatchBook,
  Youtube,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function UserGroupDetailsPage() {
  // {
  // params
  // }: Props
  const t = await getTranslations();
  // const { wsId, courseId } = await params;

  return (
    <div className="grid gap-4">
      <CourseSection
        title={t('course-details-tabs.module_objectives')}
        icon={<Goal className="h-5 w-5" />}
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
      />
    </div>
  );
}
