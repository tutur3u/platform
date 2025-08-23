import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Calendar, Users } from '@tuturuuu/ui/icons';
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

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="font-semibold text-base">
          🗓️ TuMeet Plans
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
              href={`/meet-together/plans/${plan.id.replace(/-/g, '')}`}
              key={plan.id}
            >
              <button
                type="button"
                key={plan.id}
                className="flex w-full items-start justify-start rounded-lg border bg-card/50 p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      <Calendar className="h-3 w-3" />
                    </div>
                    <div className="flex flex-1 flex-col items-start justify-start">
                      <h4 className="font-medium leading-none">
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
                  <div className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                    <Users className="h-3 w-3" />
                    <span>Plan</span>
                  </div>
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
