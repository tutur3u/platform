import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Calendar, SquaresIntersect, Users } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { format } from 'date-fns';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function RecentTumeetPlans({
  className,
}: {
  className?: string;
}) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const sbAdmin = await createAdminClient();

  const createdPlansQuery = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('creator_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const joinedPlansQuery = sbAdmin
    .from('meet_together_user_timeblocks')
    .select('...meet_together_plans!inner(*)')
    .eq('user_id', user.id)
    .order('created_at', {
      ascending: false,
      referencedTable: 'meet_together_plans',
    })
    .limit(10);

  const [createdPlansResult, joinedPlansResult] = await Promise.all([
    createdPlansQuery,
    joinedPlansQuery,
  ]);

  const { data: createdPlans, error: createdError } =
    createdPlansResult as unknown as {
      data: MeetTogetherPlan[] | null;
      error: unknown;
    };
  const { data: joinedPlans, error: joinedError } =
    joinedPlansResult as unknown as {
      data: MeetTogetherPlan[] | null;
      error: unknown;
    };

  if (createdError || joinedError) {
    console.error('Error fetching tumeet plans:', createdError || joinedError);
    return null;
  }

  const plans: MeetTogetherPlan[] = Array.from(
    new Map(
      [...(createdPlans || []), ...(joinedPlans || [])].map((p) => [p.id, p])
    ).values()
  )
    .sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    )
    .slice(0, 8);

  // Build participants map for displayed plans (users/guests who filled availability)
  const planIds = plans.map((p) => p.id).filter(Boolean) as string[];
  let planIdToParticipants = new Map<
    string,
    Array<{
      user_id: string | null;
      display_name: string | null;
      is_guest: boolean | null;
      timeblock_count: number | null;
      plan_id: string | null;
    }>
  >();

  if (planIds.length > 0) {
    const { data: participants } = await sbAdmin
      .from('meet_together_users')
      .select('user_id, display_name, is_guest, timeblock_count, plan_id')
      .in('plan_id', planIds);

    if (participants) {
      planIdToParticipants = participants.reduce(
        (map, p) => {
          if (!p.plan_id) return map;
          const arr = map.get(p.plan_id) || [];
          if ((p.timeblock_count || 0) > 0) arr.push(p);
          map.set(p.plan_id, arr);
          return map;
        },
        new Map<
          string,
          Array<{
            user_id: string | null;
            display_name: string | null;
            is_guest: boolean | null;
            timeblock_count: number | null;
            plan_id: string | null;
          }>
        >()
      );
    }
  }

  return (
    <Card
      className={cn(
        'overflow-hidden border-dynamic-pink/20 transition-all duration-300',
        className
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-pink/20 border-b bg-gradient-to-r from-dynamic-pink/5 to-dynamic-purple/5 p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div className="rounded-lg bg-dynamic-pink/10 p-1.5 text-dynamic-pink">
            <SquaresIntersect className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('tu_meet_plans')}</div>
        </CardTitle>
        <Link href="/meet-together">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 transition-colors hover:bg-dynamic-pink/10 hover:text-dynamic-pink"
          >
            <Calendar className="mr-1 h-3 w-3" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="grid gap-3 p-6 lg:grid-cols-2">
        {plans && plans.length > 0 ? (
          plans.map((plan: MeetTogetherPlan) => (
            <Link
              href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
              key={plan.id}
            >
              <div className="group h-full rounded-xl border border-dynamic-pink/10 bg-gradient-to-br from-dynamic-pink/5 to-dynamic-purple/5 p-4 transition-all duration-300">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex flex-1 flex-col items-start justify-start">
                        <h4 className="line-clamp-2 font-semibold text-sm">
                          {plan.name || t('untitled_plan')}
                        </h4>
                        <div className="mt-2 flex items-center gap-2 text-dynamic-pink text-xs">
                          <span className="font-medium">
                            {plan.created_at &&
                              format(
                                new Date(plan.created_at),
                                'MMM d, h:mm a'
                              )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1">
                    {(() => {
                      const participants =
                        planIdToParticipants.get(plan.id || '') || [];
                      const displayed = participants.slice(0, 3);
                      const remaining = Math.max(
                        0,
                        participants.length - displayed.length
                      );
                      return (
                        <div className="flex items-center gap-2 text-dynamic-pink text-xs">
                          <div className="-space-x-1 flex">
                            {displayed.map((p) => (
                              <Avatar
                                key={`${plan.id}-${p.user_id}`}
                                className="h-5 w-5 ring-2 ring-background transition-transform group-hover:scale-110"
                              >
                                <AvatarImage
                                  src={undefined}
                                  alt={p.display_name || 'User'}
                                />
                                <AvatarFallback className="text-[10px]">
                                  {(p.display_name?.[0] || 'U').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {remaining > 0 && (
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-[10px] ring-2 ring-background transition-transform group-hover:scale-110">
                                +{remaining}
                              </div>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3 text-dynamic-pink/80" />
                            <span className="font-medium">
                              {participants.length}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="col-span-full py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-gradient-to-br from-dynamic-gray/10 to-dynamic-slate/10">
              <Calendar className="h-8 w-8 text-dynamic-gray/60" />
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-base text-dynamic-gray">
                {t('no_recent_plans_title')}
              </h3>
              <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
                {t('no_recent_plans_desc')}
              </p>
            </div>
            <div className="mt-6">
              <Link href="/meet-together">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-pink/20 text-dynamic-pink transition-all duration-200 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/10"
                >
                  <SquaresIntersect className="mr-2 h-4 w-4" />
                  {t('create_plan')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
