import { ExternalLink, Video } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TTR_URL } from '@/constants/common';
import { getMeetWorkspaceContext } from '../workspace-context';

export const metadata: Metadata = {
  title: 'Meetings',
  description:
    'Manage Meetings in the Tuturuuu Meet area of your Tuturuuu workspace.',
};

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId: id } = await params;
  const { workspaceSlug } = await getMeetWorkspaceContext(id);
  const t = await getTranslations('meet_workspace');

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl items-center justify-center p-4">
      <Card className="w-full border-border/60 bg-background/80 shadow-foreground/5 shadow-sm">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-blue/10 text-dynamic-blue">
            <Video className="h-5 w-5" />
          </div>
          <CardTitle>{t('meetings_title')}</CardTitle>
          <CardDescription>{t('meetings_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href={`${TTR_URL}/${workspaceSlug}/meet/meetings`}>
              {t('open_platform_meetings')}
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
