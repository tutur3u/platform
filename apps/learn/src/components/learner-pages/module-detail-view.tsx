import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  Layers,
  Youtube,
} from '@tuturuuu/icons';
import type {
  TulearnCourseDetail,
  TulearnCourseModuleDetail,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ContentCard } from './content-card';
import { LearnerQuizzes } from './learner-quizzes';
import { hasContent, RichContentRenderer } from './rich-content-renderer';
import { EmptyState, SurfaceCard } from './shared';
import { YoutubeCard } from './youtube-card';

type CourseModule = TulearnCourseModuleDetail;
type CourseModuleSummary = TulearnCourseDetail['modules'][number];
type CourseGroup = Pick<TulearnCourseDetail, 'description' | 'name'>;

export function ModuleDetailView({
  courseModule,
  group,
  moduleIndex,
  nextModule,
  onBack,
  onNavigate,
  previousModule,
  totalModules,
}: {
  courseModule: CourseModule;
  group: CourseGroup;
  moduleIndex: number;
  nextModule?: CourseModuleSummary;
  onBack: () => void;
  onNavigate: (id: string) => void;
  previousModule?: CourseModuleSummary;
  totalModules: number;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'content' | 'quizzes'>('content');
  const videos = courseModule.youtube_links ?? [];

  return (
    <div className="space-y-6" data-learn-module-detail-id={courseModule.id}>
      <div className="flex items-center gap-2 text-sm">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 font-bold transition"
          data-learn-module-back
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('courses.backToModules')}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold text-muted-foreground">
          {group.name ?? t('courses.untitled')}
        </span>
      </div>

      <SurfaceCard className="p-6">
        <Badge className="mb-3 border border-border bg-dynamic-cyan/15 font-bold text-foreground">
          <Layers className="mr-1.5 h-3 w-3" />
          {t('courses.modulePosition', {
            current: moduleIndex + 1,
            total: totalModules,
          })}
        </Badge>
        <h2 className="font-semibold text-3xl leading-tight tracking-normal">
          {courseModule.name ?? t('courses.untitled')}
        </h2>
        {group.description && (
          <p className="mt-2 text-muted-foreground leading-relaxed">
            {group.description}
          </p>
        )}
      </SurfaceCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-5">
          <div
            className="flex gap-2 border-border border-b pb-1"
            data-learn-module-tabs
          >
            <button
              className={cn(
                'cursor-pointer rounded-lg border border-border px-4 py-2 font-semibold text-sm transition',
                activeTab === 'content'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-foreground'
              )}
              data-learn-module-tab="content"
              onClick={() => setActiveTab('content')}
              type="button"
            >
              {t('courses.moduleContent')}
            </button>
            {courseModule.quizzes?.length > 0 && (
              <button
                className={cn(
                  'cursor-pointer rounded-lg border border-border px-4 py-2 font-semibold text-sm transition',
                  activeTab === 'quizzes'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground'
                )}
                data-learn-module-tab="quizzes"
                onClick={() => setActiveTab('quizzes')}
                type="button"
              >
                {t('courses.quizzes')} ({courseModule.quizzes.length})
              </button>
            )}
          </div>

          {activeTab === 'quizzes' && courseModule.quizzes?.length > 0 ? (
            <LearnerQuizzes
              key={courseModule.id}
              quizzes={courseModule.quizzes}
              moduleId={courseModule.id}
              submissions={courseModule.submissions}
              isQuizScorePublished={courseModule.is_quiz_score_published}
              quizDeadline={courseModule.quiz_deadline}
            />
          ) : (
            <>
              {hasContent(courseModule.content) && (
                <ContentCard
                  icon={<BookOpen className="h-4 w-4" />}
                  title={t('courses.moduleContent')}
                >
                  <RichContentRenderer content={courseModule.content} />
                </ContentCard>
              )}

              {videos.length > 0 && (
                <ContentCard
                  icon={<Youtube className="h-4 w-4" />}
                  title={t('courses.videos')}
                >
                  <div className="grid gap-3">
                    {videos.map((link) => (
                      <YoutubeCard key={link} url={link} />
                    ))}
                  </div>
                </ContentCard>
              )}

              {hasContent(courseModule.extra_content) && (
                <ContentCard
                  icon={<BookText className="h-4 w-4" />}
                  title={t('courses.extraReading')}
                >
                  <RichContentRenderer content={courseModule.extra_content} />
                </ContentCard>
              )}

              {!hasContent(courseModule.content) &&
                videos.length === 0 &&
                !hasContent(courseModule.extra_content) &&
                (courseModule.quizzes?.length ?? 0) === 0 && (
                  <EmptyState label={t('courses.moduleEmpty')} />
                )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <SurfaceCard className="p-4">
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              {t('courses.moduleStatus')}
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{t('courses.quizzes')}</span>
                <span className="font-bold">{courseModule.counts.quizzes}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('courses.quizSets')}</span>
                <span className="font-bold">
                  {courseModule.counts.quizSets}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t('courses.flashcards')}</span>
                <span className="font-bold">
                  {courseModule.counts.flashcards}
                </span>
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-4">
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              {t('courses.moduleNavigation')}
            </p>
            <div className="mt-3 space-y-2">
              {previousModule && (
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                  onClick={() => onNavigate(previousModule.id)}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="truncate">{t('common.previous')}</span>
                </button>
              )}
              {nextModule && (
                <button
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                  onClick={() => onNavigate(nextModule.id)}
                  type="button"
                >
                  <span className="truncate">{t('common.next')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </SurfaceCard>

          <div className="border border-dynamic-green/30 bg-dynamic-green/10 p-4 text-dynamic-green text-sm leading-relaxed">
            {t('courses.moduleHint')}
          </div>
        </aside>
      </div>
    </div>
  );
}
