import LinkButton from './link-button';
import { UserGroup } from '@/types/primitives/UserGroup';
import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  BookText,
  Eye,
  Goal,
  GraduationCap,
  ListTodo,
  Paperclip,
  SwatchBook,
  Youtube,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
    wsId: string;
    courseId: string;
  }>;
}

export default async function CourseDetailsLayout({ children, params }: Props) {
  const t = await getTranslations();
  const { wsId, courseId } = await params;
  const commonHref = `/${wsId}/education/courses/${courseId}`;

  const group = await getData(wsId, courseId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="flex w-full items-center gap-2 text-2xl font-bold">
              <div className="bg-dynamic-blue/20 border-dynamic-blue/20 text-dynamic-blue flex items-center gap-2 rounded-lg border px-2 text-lg">
                <GraduationCap className="h-6 w-6" />
                {t('ws-courses.singular')}
              </div>
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="flex flex-wrap gap-2">
              <LinkButton
                href={`${commonHref}`}
                title={t('course-details-tabs.preview')}
                icon={<Eye className="h-5 w-5" />}
                className="border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20"
              />
              <LinkButton
                href={`${commonHref}/objectives`}
                title={t('course-details-tabs.module_objectives')}
                icon={<Goal className="h-5 w-5" />}
                className="border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
              />
              <LinkButton
                href={`${commonHref}/resources`}
                title={`${t('course-details-tabs.resources')} (0)`}
                icon={<Paperclip className="h-5 w-5" />}
                className="border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20"
                disabled
              />
              <LinkButton
                href={`${commonHref}/youtube-links`}
                title={`${t('course-details-tabs.youtube_links')} (0)`}
                icon={<Youtube className="h-5 w-5" />}
                className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20"
                disabled
              />
              <LinkButton
                href={`${commonHref}/quizzes`}
                title={`${t('ws-quizzes.plural')} (0)`}
                icon={<ListTodo className="h-5 w-5" />}
                className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20"
                disabled
              />
              <LinkButton
                href={`${commonHref}/flashcards`}
                title={`${t('ws-flashcards.plural')} (0)`}
                icon={<SwatchBook className="h-5 w-5" />}
                className="border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky hover:bg-dynamic-sky/20"
                disabled
              />
              <LinkButton
                href={`${commonHref}/extra-content`}
                title={t('course-details-tabs.extra_reading')}
                icon={<BookText className="h-5 w-5" />}
                className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20"
              />
            </div>
          </>
        }
      />
      <Separator className="my-4" />
      {children}
    </>
  );
}

async function getData(wsId: string, courseId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_courses')
    .select('*')
    .eq('ws_id', wsId)
    .eq('id', courseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) notFound();

  return data as UserGroup;
}
