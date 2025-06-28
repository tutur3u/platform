import { createClient } from '@tuturuuu/supabase/next/server';
import DeleteLinkButton from '@tuturuuu/ui/custom/education/modules/youtube/delete-link-button';
import { YoutubeEmbed } from '@tuturuuu/ui/custom/education/modules/youtube/embed';
import YouTubeLinkForm from '@tuturuuu/ui/custom/education/modules/youtube/form';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Youtube } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { extractYoutubeId } from '@/utils/url-helper';

interface Props {
  params: Promise<{
    wsId: string;
    courseId: string;
    moduleId: string;
  }>;
}

export default async function ModuleYoutubeLinksPage({ params }: Props) {
  const { wsId, courseId, moduleId } = await params;
  const t = await getTranslations();
  const links = await getYoutubeLinks(moduleId, courseId);

  return (
    <div className="grid gap-4">
      <FeatureSummary
        title={
          <div className="flex items-center justify-between gap-4">
            <h1 className="flex w-full items-center gap-2 text-lg font-bold md:text-2xl">
              <Youtube className="h-5 w-5" />
              {t('course-details-tabs.youtube_links')}
            </h1>
          </div>
        }
        singularTitle={t('ws-course-modules.youtube_link')}
        pluralTitle={t('ws-course-modules.youtube_links')}
        createTitle={t('ws-course-modules.add_link')}
        createDescription={t('ws-course-modules.add_youtube_link_description')}
        form={
          <YouTubeLinkForm
            wsId={wsId}
            moduleId={moduleId}
            links={links || []}
          />
        }
      />
      {links &&
        links.length > 0 &&
        links.map((link: string, index: number) => (
          <div
            key={`${index}-${link}`}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-foreground/10 p-2 md:p-4"
          >
            <DeleteLinkButton
              moduleId={moduleId}
              courseId={courseId}
              link={link}
              links={links}
            />
            <Link
              href={link}
              className="font-semibold hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {link}
            </Link>
            <Separator className="my-2" />
            <div className="aspect-video w-full">
              <YoutubeEmbed key={index} embedId={extractYoutubeId(link)} />
            </div>
          </div>
        ))}
    </div>
  );
}

const getYoutubeLinks = async (moduleId: string, courseId: string) => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_course_modules')
    .select('youtube_links')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .single();

  if (error) {
    console.error('error', error);
  }

  return data?.youtube_links;
};
