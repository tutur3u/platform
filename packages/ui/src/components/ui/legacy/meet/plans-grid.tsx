'use client';

import {
  PlanCardActions,
  PlanDates,
  PlanMeta,
  PlanParticipants,
  PlanTitleLink,
} from './plan-card-parts';
import type { MeetTogetherPlanWithParticipants } from './page';
import { PlansEmpty } from './plans-empty';

export function PlansGrid({
  plans,
  locale,
  user,
  path = '/meet/plans',
}: {
  plans: MeetTogetherPlanWithParticipants[];
  locale: string;
  user?: { id: string } | null;
  path?: string;
}) {
  if (plans.length === 0) return <PlansEmpty />;

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {plans.map((plan) => (
        <li
          className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-elevation-1 transition-colors hover:bg-accent/40 has-focus-visible:ring-2 has-focus-visible:ring-ring md:p-5"
          key={plan.id}
        >
          <div className="flex items-start justify-between gap-3">
            <PlanTitleLink className="line-clamp-2" path={path} plan={plan} />
            <PlanCardActions plan={plan} userId={user?.id} />
          </div>
          {plan.description && (
            <p className="line-clamp-2 text-muted-foreground text-sm">
              {plan.description}
            </p>
          )}
          <PlanMeta locale={locale} plan={plan} withCounts={false} />
          <PlanParticipants plan={plan} />
          <PlanDates locale={locale} plan={plan} />
        </li>
      ))}
    </ul>
  );
}
