import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Calendar, SquaresIntersect, Users } from '@tuturuuu/ui/icons';
import { format } from 'date-fns';
import Link from 'next/link';

export default async function RecentTumeetPlans() {
  const supabase = await createClient();

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
    .slice(0, 5);

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
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <SquaresIntersect className="h-5 w-5" />
          <div className="line-clamp-1">TuMeet Plans</div>
        </CardTitle>
        <Link href="/meet-together">
          <Button variant="ghost" size="sm" className="h-8 px-2">
            <Calendar className="mr-1 h-3 w-3" />
            View All
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="grid gap-3">
        {plans && plans.length > 0 ? (
          plans.map((plan: MeetTogetherPlan) => (
            <Link
              href={`/meet-together/plans/${plan.id?.replace(/-/g, '')}`}
              key={plan.id}
            >
              <button
                type="button"
                key={plan.id}
                className="flex w-full items-start justify-start rounded-lg border bg-card/50 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex-1 space-y-1 text-left">
                  <div className="flex items-start gap-2">
                    <div className="flex flex-1 flex-col items-start justify-start">
                      <h4 className="line-clamp-2 font-medium leading-none">
                        {plan.name || 'Untitled Plan'}
                      </h4>
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                        <span>
                          {plan.created_at &&
                            format(new Date(plan.created_at), 'MMM d, h:mm a')}
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
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <div className="-space-x-1 flex">
                          {displayed.map((p) => (
                            <Avatar
                              key={`${plan.id}-${p.user_id}`}
                              className="h-5 w-5 ring-2 ring-background"
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
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-[10px] ring-2 ring-background">
                              +{remaining}
                            </div>
                          )}
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{participants.length}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </button>
            </Link>
          ))
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <div className="mb-2">
              <Calendar className="mx-auto h-8 w-8 opacity-50" />
            </div>
            <p className="text-sm">No recent plans</p>
            <p className="text-xs">Your latest TuMeet plans will appear here</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
