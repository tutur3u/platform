import { cn } from '@/lib/utils';
import { UserGroup } from '@/types/primitives/UserGroup';
import { createClient } from '@/utils/supabase/server';
import { Button } from '@repo/ui/components/ui/button';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  BookText,
  Eye,
  Goal,
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

  const group = await getData(wsId, courseId);

  return (
    <>
      <FeatureSummary
        title={
          <>
            <h1 className="w-full text-2xl font-bold">
              {group.name || t('ws-user-groups.singular')}
            </h1>
            <Separator className="my-2" />
          </>
        }
        description={
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/20'
                )}
                disabled
              >
                <Eye className="h-5 w-5" />
                {t('course-details-tabs.preview')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20'
                )}
                disabled
              >
                <Goal className="h-5 w-5" />
                {t('course-details-tabs.module_objectives')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
                )}
                disabled
              >
                <Paperclip className="h-5 w-5" />
                {t('course-details-tabs.resources')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/20'
                )}
                disabled
              >
                <Youtube className="h-5 w-5" />
                {t('course-details-tabs.youtube_links')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
                )}
                disabled
              >
                <ListTodo className="h-5 w-5" />
                {t('ws-quizzes.plural')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky hover:bg-dynamic-sky/20'
                )}
                disabled
              >
                <SwatchBook className="h-5 w-5" />
                {t('ws-flashcards.plural')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  'border font-semibold',
                  'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange hover:bg-dynamic-orange/20'
                )}
                disabled
              >
                <BookText className="h-5 w-5" />
                {t('course-details-tabs.extra_reading')}
              </Button>
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
