import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import { Badge } from '@ncthub/ui/badge';
import { cn } from '@ncthub/utils/format';
import dayjs from 'dayjs';
import Link from 'next/link';
import UserTime from './user-time';

interface Props {
  plan: MeetTogetherPlan;
  locale: string;
  labels: {
    planCardLabel: string;
    noDescription: string;
    public: string;
    private: string;
  };
}

export default function PlanCard({ plan, locale, labels }: Props) {
  return (
    <Link
      href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
      className="group flex min-h-64 w-full flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-background/85 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-foreground/5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-2 font-medium text-[11px] text-foreground/45 uppercase tracking-[0.18em]">
            {labels.planCardLabel}
          </p>
          <h3 className="line-clamp-2 text-left font-semibold text-lg leading-snug transition-colors duration-200 group-hover:text-foreground/90 md:text-xl">
            {plan.name}
          </h3>
        </div>
        <Badge
          variant="outline"
          className={`rounded-full px-3 py-1 font-medium text-xs`}
        >
          {plan.is_public ? labels.public : labels.private}
        </Badge>
      </div>

      <div className="mt-2 flex grow flex-col justify-between gap-5">
        <div className="space-y-3">
          {plan.description ? (
            <p className="line-clamp-3 text-foreground text-sm leading-6">
              {plan.description}
            </p>
          ) : (
            <p className="text-foreground/50 text-sm italic leading-6">
              {labels.noDescription}
            </p>
          )}

          {plan.start_time && plan.end_time && (
            <div className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/3 px-3 py-1.5 text-foreground/72 text-sm transition-colors duration-200 group-hover:border-foreground/15 group-hover:text-foreground/88">
              <span className="font-semibold text-foreground/85">
                <UserTime time={plan.start_time} /> -{' '}
                <UserTime time={plan.end_time} />
              </span>
              <span className="ml-2 text-foreground/50">
                GMT
                {Intl.NumberFormat('en-US', {
                  signDisplay: 'always',
                }).format(
                  parseInt(plan.start_time?.split(/[+-]/)?.[1] ?? '0', 10) *
                    (plan.start_time?.includes('-') ? -1 : 1)
                )}
              </span>
            </div>
          )}
        </div>

        {plan.dates && plan.dates.length > 0 && (
          <div className="flex flex-wrap gap-2 text-center">
            {plan.dates?.slice(0, 5).map((date) => (
              <div
                key={date}
                className={cn(
                  'rounded-full border border-foreground/8 bg-foreground/4 px-3 py-1 font-medium text-foreground/72 text-xs transition-colors duration-200 group-hover:border-foreground/12 group-hover:bg-foreground/6',
                  (plan.dates?.length || 0) <= 2 && 'flex-1'
                )}
              >
                {dayjs(date)
                  .locale(locale)
                  .format(`${locale === 'vi' ? 'DD/MM (ddd)' : 'MMM D (ddd)'}`)}
              </div>
            ))}
            {plan.dates.length > 5 && (
              <div className="rounded-full border border-foreground/8 bg-foreground/4 px-3 py-1 font-medium text-foreground/60 text-xs transition-colors duration-200 group-hover:border-foreground/12 group-hover:bg-foreground/6">
                +{plan.dates.length - 5}
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
