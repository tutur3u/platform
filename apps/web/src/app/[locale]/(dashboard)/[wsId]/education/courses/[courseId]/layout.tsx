import { UserGroup } from '@/types/primitives/UserGroup';
import { createClient } from '@repo/supabase/next/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
import { GraduationCap } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
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
  const data = await getData(wsId, courseId);

  return (
    <>
      <FeatureSummary
        title={
          <h1 className="flex w-full items-center gap-2 text-2xl font-bold">
            <div className="flex items-center gap-2 rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 text-lg text-dynamic-blue max-md:hidden">
              <GraduationCap className="h-6 w-6" />
              {t('ws-courses.singular')}
            </div>
            <Link
              href={`/${wsId}/education/courses/${courseId}`}
              className="line-clamp-1 text-lg font-bold hover:underline md:text-2xl"
            >
              {data.name || t('common.unknown')}
            </Link>
          </h1>
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
