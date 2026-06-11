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
import { BrutalCard, EmptyState } from './shared';
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
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <button
          className="inline-flex items-center gap-1.5 border-2 border-border bg-background px-3 py-1.5 font-bold shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
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

      <BrutalCard className="p-6">
        <Badge className="mb-3 border-2 border-border bg-dynamic-cyan/15 font-bold text-foreground shadow-[2px_2px_0_var(--border)]">
          <Layers className="mr-1.5 h-3 w-3" />
          {t('courses.modulePosition', {
            current: moduleIndex + 1,
            total: totalModules,
          })}
        </Badge>
        <h2 className="font-black text-3xl leading-tight tracking-normal">
          {courseModule.name ?? t('courses.untitled')}
        </h2>
        {group.description && (
          <p className="mt-2 text-muted-foreground leading-relaxed">
            {group.description}
          </p>
        )}
      </BrutalCard>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-5">
          {courseModule.quizzes?.length > 0 && (
            <div className="flex gap-2 border-border border-b-2 pb-1">
              <button
                onClick={() => setActiveTab('content')}
                className={cn(
                  'cursor-pointer border-2 border-border px-4 py-2 font-black text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]',
                  activeTab === 'content'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground'
                )}
                type="button"
              >
                {t('courses.moduleContent')}
              </button>
              <button
                onClick={() => setActiveTab('quizzes')}
                className={cn(
                  'cursor-pointer border-2 border-border px-4 py-2 font-black text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]',
                  activeTab === 'quizzes'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-foreground'
                )}
                type="button"
              >
                {t('courses.quizzes')} ({courseModule.quizzes.length})
              </button>
            </div>
          )}

          {activeTab === 'quizzes' && courseModule.quizzes?.length > 0 ? (
            <LearnerQuizzes quizzes={courseModule.quizzes as any} />
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
                !hasContent(courseModule.extra_content) && (
                  <EmptyState label={t('courses.moduleEmpty')} />
                )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <BrutalCard className="p-4">
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
          </BrutalCard>

          <BrutalCard className="p-4">
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              {t('courses.moduleNavigation')}
            </p>
            <div className="mt-3 space-y-2">
              {previousModule && (
                <button
                  className="flex w-full items-center justify-between border-2 border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                  onClick={() => onNavigate(previousModule.id)}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="truncate">{t('common.previous')}</span>
                </button>
              )}
              {nextModule && (
                <button
                  className="flex w-full items-center justify-between border-2 border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                  onClick={() => onNavigate(nextModule.id)}
                  type="button"
                >
                  <span className="truncate">{t('common.next')}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </BrutalCard>

          <div className="border-2 border-dynamic-green/30 bg-dynamic-green/10 p-4 text-dynamic-green text-sm leading-relaxed shadow-[3px_3px_0_hsl(var(--dynamic-green)/0.2)]">
            {t('courses.moduleHint')}
          </div>
        </aside>
      </div>
    </div>
  );
}
