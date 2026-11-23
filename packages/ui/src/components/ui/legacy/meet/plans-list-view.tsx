'use client';

import { PlanCardActions, PlanMeta, PlanTitleLink } from './plan-card-parts';
import type { MeetTogetherPlanWithParticipants } from './page';
import { PlansEmpty } from './plans-empty';

export function PlansListView({
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
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {plans.map((plan) => (
        <li
          className="relative flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-accent/40 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset md:px-5"
          key={plan.id}
        >
          <div className="flex items-center justify-between gap-3">
            <PlanTitleLink className="line-clamp-1" path={path} plan={plan} />
            <PlanCardActions plan={plan} userId={user?.id} />
          </div>
          {plan.description && (
            <p className="line-clamp-1 text-muted-foreground text-sm">
              {plan.description}
            </p>
          )}
          <PlanMeta locale={locale} plan={plan} withCounts />
        </li>
      ))}
    </ul>
  );
}
