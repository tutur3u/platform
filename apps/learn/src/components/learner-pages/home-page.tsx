'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ClipboardCheck,
  Flame,
  Heart,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
} from '@tuturuuu/icons';
import { getTulearnHome } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { CourseCard } from './course-card';
import { FeatureList } from './feature-list';
import {
  MiniPanel,
  MissionPanel,
  QuestCard,
  QuestPanel,
  StatBubble,
} from './home-panels';
import {
  EmptyState,
  LoadingState,
  usePageMotion,
  useStudentHref,
  useStudentId,
} from './shared';

export function HomePage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const scopeRef = usePageMotion();
  const practiceHref = useStudentHref(`/${wsId}/practice`);
  const coursesHref = useStudentHref(`/${wsId}/courses`);
  const assignmentsHref = useStudentHref(`/${wsId}/assignments`);
  const home = useQuery({
    queryFn: () => getTulearnHome(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'home'],
  });

  if (home.isLoading) return <LoadingState />;
  if (!home.data) return <EmptyState label={t('common.empty')} />;

  const state = home.data.state;
  const studentName = home.data.student.name ?? t('common.learner');
  const nextCourse = home.data.courses[0];
  const dueAssignments = home.data.assignments.filter(
    (assignment) => !assignment.is_completed
  );
  const completedAssignments =
    home.data.assignments.length - dueAssignments.length;
  const averageProgress = home.data.courses.length
    ? Math.round(
        home.data.courses.reduce((sum, course) => sum + course.progress, 0) /
          home.data.courses.length
      )
    : 0;

  const quests = [
    {
      complete: Boolean(home.data.recommendedPractice),
      description: t('home.questPracticeDescription'),
      href: practiceHref,
      icon: Target,
      title: t('home.questPractice'),
    },
    {
      complete: dueAssignments.length === 0 && home.data.assignments.length > 0,
      description:
        dueAssignments.length > 0
          ? t('home.questAssignmentsCount', { count: dueAssignments.length })
          : t('assignments.empty'),
      href: assignmentsHref,
      icon: ClipboardCheck,
      title: t('home.questAssignments'),
    },
    {
      complete: averageProgress >= 80,
      description: t('home.questProgressDescription', {
        progress: averageProgress,
      }),
      href: coursesHref,
      icon: Star,
      title: t('home.questProgress'),
    },
  ];

  return (
    <div className="space-y-24" ref={scopeRef}>
      <section
        className="relative isolate overflow-hidden rounded-[2.25rem] border border-dynamic-green/20 bg-background p-6 shadow-sm md:p-9"
        data-tulearn-reveal
      >
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-dynamic-green/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 left-1/4 h-72 w-72 rounded-full bg-dynamic-orange/10 blur-3xl"
        />
        <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-dynamic-green/25 bg-dynamic-green/10 px-4 py-2 font-semibold text-dynamic-green text-sm">
              <Sparkles className="h-4 w-4" />
              {t('home.dailyGoal')}
            </div>
            <h1 className="max-w-5xl text-balance font-bold text-[clamp(2.8rem,6vw,5.75rem)] leading-[0.92] tracking-normal">
              {t('home.heroTitle', { name: studentName })}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-8">
              {home.data.recommendedPractice?.title ??
                t('home.heroDescription')}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-dynamic-green px-6 font-semibold text-primary-foreground transition hover:bg-dynamic-green/90 active:translate-y-px"
                href={practiceHref}
              >
                <Zap className="h-4 w-4" />
                {t('home.startPractice')}
              </Link>
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 font-semibold transition hover:bg-muted active:translate-y-px"
                href={coursesHref}
              >
                <BookOpen className="h-4 w-4" />
                {t('home.openMap')}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatBubble
              icon={Sparkles}
              label={t('home.xp')}
              value={state.xp_total}
            />
            <StatBubble
              accent="orange"
              icon={Flame}
              label={t('home.streak')}
              value={state.current_streak}
            />
            <StatBubble
              accent="blue"
              icon={Heart}
              label={t('home.hearts')}
              value={`${state.hearts}/${state.max_hearts}`}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div
          className="grid grid-flow-dense gap-3 md:grid-cols-6"
          data-tulearn-reveal
        >
          <MissionPanel
            actionHref={nextCourse ? coursesHref : practiceHref}
            actionLabel={
              nextCourse ? t('home.continueCourse') : t('home.startPractice')
            }
            description={nextCourse?.description ?? t('courses.empty')}
            icon={Rocket}
            stat={`${averageProgress}%`}
            title={nextCourse?.name ?? t('home.nextLesson')}
          />
          <QuestPanel
            completedAssignments={completedAssignments}
            dueAssignments={dueAssignments.length}
            totalAssignments={home.data.assignments.length}
          />
          <MiniPanel
            icon={ShieldCheck}
            label={t('home.parentSnapshot')}
            span="wide"
            value={
              home.data.readOnly
                ? t('settings.parentMode')
                : t('home.studentMode')
            }
          />
          <MiniPanel
            icon={Trophy}
            label={t('home.recentWin')}
            span="compact"
            value={
              home.data.marks[0]?.metric.name ??
              home.data.recommendedPractice?.courseName ??
              t('common.empty')
            }
          />
        </div>
        <div className="space-y-3" data-tulearn-reveal>
          <h2 className="font-bold text-2xl tracking-normal">
            {t('home.dailyQuests')}
          </h2>
          {quests.map((quest) => (
            <QuestCard key={quest.title} quest={quest} />
          ))}
        </div>
      </section>

      <section
        className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]"
        data-journey
      >
        <div className="h-fit" data-pin-title>
          <h2 className="font-bold text-[clamp(2rem,4vw,3.75rem)] leading-none tracking-normal">
            {t('home.learningPath')}
          </h2>
          <p className="mt-4 text-muted-foreground leading-7">
            {t('home.learningPathDescription')}
          </p>
        </div>
        <div className="space-y-4">
          {home.data.courses.slice(0, 5).map((course, index) => (
            <CourseCard course={course} index={index} key={course.id} stacked />
          ))}
          {!home.data.courses.length ? (
            <EmptyState label={t('courses.empty')} />
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <FeatureList
          actionHref={assignmentsHref}
          actionLabel={t('assignments.title')}
          completedLabel={t('common.completed')}
          emptyLabel={t('assignments.empty')}
          items={home.data.assignments.slice(0, 4)}
          title={t('home.assignments')}
          type="assignment"
        />
        <FeatureList
          emptyLabel={t('marks.empty')}
          items={home.data.marks.slice(0, 4)}
          title={t('home.marks')}
          type="mark"
        />
      </section>
    </div>
  );
}
