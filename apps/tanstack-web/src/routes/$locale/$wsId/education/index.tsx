import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  ClipboardCheck,
  GraduationCap,
  Library,
  SwatchBook,
} from '@tuturuuu/icons';
import {
  getWorkspaceFlashcards,
  getWorkspaceQuizzes,
  listWorkspaceCourses,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { requireCurrentUser } from '@/lib/platform/auth-gate';
import { createPageHead } from '@/lib/platform/head';
import { resolveMessagesLocale } from '@/lib/platform/messages';
import { resolveWorkspace } from '@/lib/platform/workspace';

type EducationOverviewData = {
  coursesCount: number;
  flashcardsCount: number;
  quizzesCount: number;
  workspaceId: string;
};

type EducationStatCardProps = {
  className?: string;
  href: string;
  icon: ReactNode;
  label: ReactNode;
  tone: 'blue' | 'green' | 'sky';
  value: number;
};

const toneClassNames = {
  blue: {
    icon: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
    ring: 'hover:border-dynamic-blue/30 hover:bg-dynamic-blue/5',
    value: 'text-dynamic-blue',
  },
  green: {
    icon: 'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green',
    ring: 'hover:border-dynamic-green/30 hover:bg-dynamic-green/5',
    value: 'text-dynamic-green',
  },
  sky: {
    icon: 'border-dynamic-sky/20 bg-dynamic-sky/10 text-dynamic-sky',
    ring: 'hover:border-dynamic-sky/30 hover:bg-dynamic-sky/5',
    value: 'text-dynamic-sky',
  },
} as const;

const loadEducationOverview = createServerFn({ method: 'GET' })
  .validator((data: { wsId: string }) => data)
  .handler(async ({ data }): Promise<EducationOverviewData> => {
    const auth = withForwardedInternalApiAuth(getRequestHeaders());
    const [courses, flashcards, quizzes] = await Promise.all([
      listWorkspaceCourses(
        data.wsId,
        { page: 1, pageSize: 1, status: 'all' },
        auth
      ),
      getWorkspaceFlashcards(data.wsId, { page: 1, pageSize: 1 }, auth),
      getWorkspaceQuizzes(data.wsId, { page: 1, pageSize: 1 }, auth),
    ]);

    return {
      coursesCount: courses.count,
      flashcardsCount: flashcards.count,
      quizzesCount: quizzes.count,
      workspaceId: data.wsId,
    };
  });

export const Route = createFileRoute('/$locale/$wsId/education/')({
  component: EducationOverviewRoutePage,
  head: ({ params }) => {
    const locale = resolveMessagesLocale(params.locale);

    return createPageHead({
      description: 'Manage Education in your Tuturuuu workspace.',
      locale,
      title: 'Education',
    });
  },
  loader: async ({ params }): Promise<EducationOverviewData> => {
    await requireCurrentUser({
      locale: params.locale,
      nextPath: `/${params.wsId}/education`,
    });

    const workspace = await resolveWorkspace({ data: { wsId: params.wsId } });
    if (!workspace.exists) {
      throw notFound();
    }

    return loadEducationOverview({
      data: { wsId: workspace.workspaceId },
    });
  },
});

function EducationOverviewRoutePage() {
  const data = Route.useLoaderData() as EducationOverviewData | undefined;
  const { wsId } = Route.useParams();
  const t = useTranslations();

  if (!data) {
    throw notFound();
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-5 p-4">
      <EducationPageHeader
        title={t('sidebar_tabs.education')}
        description={t('workspace-education-tabs.overview_description')}
        badge={
          <div className="inline-flex items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <Library className="h-3.5 w-3.5" />
            {t('workspace-education-tabs.overview')}
          </div>
        }
      />

      <EducationContentSurface pattern>
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          <EducationStatCard
            className="md:col-span-2"
            href={`/${wsId}/education/courses`}
            icon={<GraduationCap className="h-5 w-5" />}
            label={t('workspace-education-tabs.courses')}
            tone="blue"
            value={data.coursesCount}
          />
          <EducationStatCard
            href={`/${wsId}/education/flashcards`}
            icon={<SwatchBook className="h-5 w-5" />}
            label={t('workspace-education-tabs.flashcards')}
            tone="sky"
            value={data.flashcardsCount}
          />
          <EducationStatCard
            href={`/${wsId}/education/quizzes`}
            icon={<ClipboardCheck className="h-5 w-5" />}
            label={t('workspace-education-tabs.quizzes')}
            tone="green"
            value={data.quizzesCount}
          />
        </div>
      </EducationContentSurface>
    </div>
  );
}

function EducationStatCard({
  className,
  href,
  icon,
  label,
  tone,
  value,
}: EducationStatCardProps) {
  const classes = toneClassNames[tone];

  return (
    <Link className={cn('block min-h-32', className)} href={href}>
      <Card
        className={cn(
          'h-full border-border/60 bg-card/90 transition-colors',
          classes.ring
        )}
      >
        <CardContent className="flex h-full items-center justify-between gap-4 p-5">
          <div className="space-y-2">
            <div className="font-medium text-foreground/70 text-sm">
              {label}
            </div>
            <div className={cn('font-semibold text-3xl', classes.value)}>
              {value}
            </div>
          </div>
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border',
              classes.icon
            )}
          >
            {icon}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
