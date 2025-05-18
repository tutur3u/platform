'use client';

import {
  Briefcase,
  GraduationCap,
  Heart,
  Home,
  Users,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

export function UseCasesSection() {
  const t = useTranslations('landing');

  const useCases = [
    {
      icon: <Briefcase className="text-dynamic-purple h-6 w-6" />,
      title: t('busy_professionals'),
      className: 'col-span-1 md:col-span-2 lg:col-span-3',
      description: t(
        'balance_client_meetings_project_deadlines_and_personal_commitments_without_the_stress_of_manual_scheduling'
      ),
      painPoints: [
        t('constantly_overbooked'),
        t('missing_deadlines'),
        t('no_time_for_deep_work'),
      ],
      solution: t(
        'tuturuuu_automatically_balances_your_workload_protects_focus_time_and_ensures_you_never_miss_a_deadline_again'
      ),
      bg: 'bg-dynamic-light-purple',
      lightBg: 'bg-calendar-bg-purple',
      border: 'border-dynamic-light-purple/30',
      textColor: 'text-dynamic-purple',
    },
    {
      icon: <Users className="text-dynamic-blue h-6 w-6" />,
      title: t('team_leaders'),
      className: 'col-span-1 md:col-span-1 lg:col-span-3',
      description: t(
        'coordinate_team_schedules_optimize_meeting_times_and_ensure_everyone_has_balanced_workloads'
      ),
      painPoints: [
        t('difficult_to_find_meeting_times'),
        t('team_burnout'),
        t('uneven_workload_distribution'),
      ],
      solution: t(
        'tuturuuu_analyzes_team_availability_suggests_optimal_meeting_slots_and_helps_distribute_work_evenly_across_your_team'
      ),
      bg: 'bg-dynamic-light-blue',
      lightBg: 'bg-calendar-bg-blue',
      border: 'border-dynamic-light-blue/30',
      textColor: 'text-dynamic-blue',
    },
    {
      icon: <GraduationCap className="text-dynamic-green h-6 w-6" />,
      title: t('students'),
      className: 'col-span-1 md:col-span-1 lg:col-span-2',
      description: t(
        'manage_classes_study_sessions_assignments_and_social_activities_with_intelligent_scheduling'
      ),
      painPoints: [
        t('last_minute_cramming'),
        t('missed_assignments'),
        t('poor_work_life_balance'),
      ],
      solution: t(
        'tuturuuu_helps_you_plan_ahead_for_assignments_allocates_proper_study_time_and_ensures_you_maintain_a_healthy_balance'
      ),
      bg: 'bg-dynamic-light-green',
      lightBg: 'bg-calendar-bg-green',
      border: 'border-dynamic-light-green/30',
      textColor: 'text-dynamic-green',
    },
    {
      icon: <Home className="text-dynamic-orange h-6 w-6" />,
      title: t('freelancers'),
      className: 'col-span-1 md:col-span-1 lg:col-span-2',
      description: t(
        'juggle_multiple_clients_and_projects_while_maintaining_control_of_your_schedule_and_work_life_balance'
      ),
      painPoints: [
        t('inconsistent_workload'),
        t('difficulty_tracking_multiple_projects'),
        t('client_deadline_conflicts'),
      ],
      solution: t(
        'tuturuuu_helps_you_manage_multiple_clients_balance_your_workload_and_ensure_you_meet_all_deadlines_without_overcommitting'
      ),
      bg: 'bg-dynamic-light-orange',
      lightBg: 'bg-calendar-bg-orange',
      border: 'border-dynamic-light-orange/30',
      textColor: 'text-dynamic-orange',
    },
    {
      icon: <Heart className="text-dynamic-red h-6 w-6" />,
      title: t('parents'),
      className: 'col-span-1 md:col-span-1 lg:col-span-2',
      description: t(
        'balance_family_responsibilities_work_commitments_and_personal_time_with_intelligent_scheduling'
      ),
      painPoints: [
        t('missed_family_events'),
        t('constant_overwhelm'),
        t('no_personal_time'),
      ],
      solution: t(
        'tuturuuu_helps_you_prioritize_family_time_while_ensuring_work_commitments_are_met_giving_you_back_control_of_your_life'
      ),
      bg: 'bg-dynamic-light-red',
      lightBg: 'bg-calendar-bg-red',
      border: 'border-dynamic-light-red/30',
      textColor: 'text-dynamic-red',
    },
  ];

  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <section
      ref={sectionRef}
      className="container relative px-0 py-24 md:py-40"
    >
      <div className="use-cases-title-wrapper mb-16 text-center">
        <h2 className="use-cases-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="from-dynamic-light-purple to-dynamic-light-blue bg-gradient-to-r bg-clip-text text-transparent">
            {t('who_benefits_from_tuturuuu')}
          </span>
        </h2>
        <p className="text-muted-foreground mx-auto max-w-3xl text-balance text-xl leading-relaxed">
          {t(
            'tuturuuu_helps_people_from_all_walks_of_life_reclaim_their_time_and_reduce_scheduling_stress'
          )}
        </p>
      </div>

      <div className="use-cases-grid grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-6">
        {useCases.map((useCase, index) => (
          <div
            key={index}
            className={cn(
              'use-case-card hover:border-dynamic-light-purple/20 dark:bg-foreground/5 dark:hover:bg-foreground/10 group transform overflow-hidden rounded-xl border border-transparent bg-white/90 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:shadow-xl',
              useCase.className
            )}
          >
            <div className="relative p-7">
              {/* Colored accent line at top */}
              <div
                className={`absolute left-0 right-0 top-0 h-1 ${useCase.bg}`}
              ></div>

              <div
                className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl ${useCase.textColor} transition-transform duration-300 group-hover:scale-110 dark:text-white`}
              >
                {useCase.icon}
              </div>

              <h3 className="mb-3 text-2xl font-bold">{useCase.title}</h3>
              <p className="text-muted-foreground mb-6">
                {useCase.description}
              </p>

              <div className="dark:bg-foreground/5 mb-5 rounded-lg bg-gray-50 p-4">
                <h4 className="text-muted-foreground mb-3 text-sm font-semibold">
                  {t('pain_points')}
                </h4>
                <ul className="space-y-2">
                  {useCase.painPoints.map((point, i) => (
                    <li
                      key={i}
                      className={cn(
                        'pain-point flex items-center gap-2 text-sm'
                      )}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${useCase.bg}`}
                      ></span>
                      <span className="text-dynamic-red font-medium">
                        {point}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div
                className={`rounded-lg border ${useCase.border} ${useCase.lightBg} p-4`}
              >
                <h4
                  className={cn(
                    'text-muted-foreground mb-2 text-sm font-semibold',
                    useCase.textColor
                  )}
                >
                  {t('our_solution')}
                </h4>
                <p className={cn('text-sm', useCase.textColor)}>
                  {useCase.solution}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
