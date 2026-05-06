'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ClipboardCheck,
  Rocket,
  ShieldCheck,
  Star,
  Target,
  Trophy,
} from '@tuturuuu/icons';
import { getTulearnHome } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { CourseCard } from './course-card';
import { FeatureList } from './feature-list';
import { HomeHero } from './home-hero';
import { MiniPanel, MissionPanel, QuestCard, QuestPanel } from './home-panels';
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
    <div className="space-y-20" ref={scopeRef}>
      <HomeHero
        coursesHref={coursesHref}
        hearts={state.hearts}
        lead={home.data.recommendedPractice?.title ?? t('home.heroDescription')}
        maxHearts={state.max_hearts}
        practiceHref={practiceHref}
        streak={state.current_streak}
        studentName={studentName}
        xp={state.xp_total}
      />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid grid-flow-dense gap-4 md:grid-cols-6">
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
        <div className="space-y-3" data-learn-reveal>
          <h2 className="font-black text-2xl tracking-normal">
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
          <h2 className="font-black text-[clamp(2rem,4vw,3.75rem)] leading-none tracking-normal">
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
