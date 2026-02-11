import {
  ArrowRight,
  Calendar,
  Plus,
  SquaresIntersect,
  Users,
} from '@tuturuuu/icons';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { formatDistanceToNow } from 'date-fns';
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
    .slice(0, 6);

  // Build participants map
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
        'group overflow-hidden border-dynamic-pink/20 bg-linear-to-br from-card via-card to-dynamic-pink/5 shadow-lg ring-1 ring-dynamic-pink/10 transition-all duration-300 hover:border-dynamic-pink/30 hover:shadow-xl hover:ring-dynamic-pink/20',
        className
      )}
    >
      <CardHeader className="space-y-0 border-dynamic-pink/20 border-b bg-linear-to-r from-dynamic-pink/10 via-dynamic-pink/5 to-transparent p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 font-semibold text-base">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-dynamic-pink/20 blur-lg" />
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-pink via-dynamic-pink/90 to-dynamic-purple shadow-lg ring-2 ring-dynamic-pink/30">
                <SquaresIntersect className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-bold">{t('tu_meet_plans')}</span>
              <span className="font-medium text-dynamic-pink text-xs">
                {plans.length} {t('recent')}
              </span>
            </div>
          </CardTitle>
          <Link href="/meet-together">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-dynamic-pink/30 bg-background/50 backdrop-blur-sm transition-all hover:border-dynamic-pink hover:bg-dynamic-pink/10 hover:text-dynamic-pink"
            >
              {t('view_all')}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {plans && plans.length > 0 ? (
          <div className="grid gap-3 2xl:grid-cols-2">
            {plans.map((plan: MeetTogetherPlan, index) => {
              const participants =
                planIdToParticipants.get(plan.id || '') || [];
              const displayed = participants.slice(0, 3);
              const remaining = Math.max(0, participants.length - 3);
              const isFirst = index === 0;

              return (
                <Link
                  href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
                  key={plan.id}
                  className="group/plan"
                >
                  <div
                    className={cn(
                      'relative h-full overflow-hidden rounded-xl border p-4 transition-all duration-200 hover:shadow-md',
                      isFirst
                        ? 'border-dynamic-pink/40 bg-linear-to-br from-dynamic-pink/10 via-dynamic-pink/5 to-transparent'
                        : 'border-border/50 hover:border-dynamic-pink/30 hover:bg-dynamic-pink/5'
                    )}
                  >
                    {/* Left accent for first plan */}
                    {isFirst && (
                      <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-dynamic-pink" />
                    )}

                    <div className={cn(isFirst && 'pl-2', 'text-center')}>
                      {/* Title */}
                      <h4 className="line-clamp-1 font-semibold text-sm transition-colors group-hover/plan:text-dynamic-pink">
                        {plan.name || t('untitled_plan')}
                      </h4>

                      {/* Meta row */}
                      <div className="mt-1 flex flex-col items-center justify-between gap-1">
                        <span className="text-muted-foreground text-xs">
                          {plan.created_at &&
                            formatDistanceToNow(new Date(plan.created_at), {
                              addSuffix: true,
                            })}
                        </span>

                        {/* Participants */}
                        <div className="flex items-center gap-2">
                          {displayed.length > 0 && (
                            <div className="flex -space-x-1.5">
                              {displayed.map((p) => (
                                <Avatar
                                  key={`${plan.id}-${p.user_id}`}
                                  className="h-6 w-6 border-2 border-background ring-1 ring-border/50"
                                >
                                  <AvatarImage
                                    src={undefined}
                                    alt={p.display_name || 'User'}
                                  />
                                  <AvatarFallback className="bg-muted font-medium text-[9px]">
                                    {(p.display_name?.[0] || 'U').toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                              {remaining > 0 && (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[9px] ring-1 ring-border/50">
                                  +{remaining}
                                </div>
                              )}
                            </div>
                          )}
                          <Badge
                            className={cn(
                              'gap-1 px-2 py-0.5 font-medium text-[10px]',
                              isFirst
                                ? 'bg-dynamic-pink/15 text-dynamic-pink ring-1 ring-dynamic-pink/30'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            <Users className="h-3 w-3" />
                            {participants.length}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="relative mx-auto mb-4 w-fit">
              <div className="absolute inset-0 animate-pulse rounded-full bg-dynamic-pink/20 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-4 border-dynamic-pink/20 bg-linear-to-br from-dynamic-pink/10 via-dynamic-pink/5 to-transparent shadow-lg ring-4 ring-dynamic-pink/10">
                <Calendar className="h-8 w-8 text-dynamic-pink/50" />
              </div>
            </div>
            <h3 className="font-semibold text-sm">
              {t('no_recent_plans_title')}
            </h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('no_recent_plans_desc')}
            </p>
            <Link href="/meet-together" className="mt-4 inline-block">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-dynamic-pink/30 transition-all hover:border-dynamic-pink hover:bg-dynamic-pink/10 hover:text-dynamic-pink"
              >
                <Plus className="h-4 w-4" />
                {t('create_plan')}
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
