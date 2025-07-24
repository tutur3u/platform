'use client';

import { useTimeBlocking } from '@/app/[locale]/(marketing)/meet-together/plans/[planId]/time-blocking-provider';
import type {
  GetPollsForPlanResult,
  MeetTogetherPlan,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import MultipleChoiceVote from '@tuturuuu/ui/legacy/tumeet/multiple-choice-vote';

interface PlanDetailsPollsProps {
  plan: MeetTogetherPlan;
  isCreator: boolean;
  platformUser: User | null;
  polls: GetPollsForPlanResult | null;
}

export default function PlanDetailsPolls({
  plan,
  isCreator,
  platformUser,
  polls,
}: PlanDetailsPollsProps) {
  const { user: guestUser } = useTimeBlocking();

  const user = guestUser ?? platformUser;
  const currentUserId = user?.id ?? null;
  const userType =
    user?.is_guest === true
      ? 'GUEST'
      : platformUser?.id
        ? 'PLATFORM'
        : 'DISPLAY';

  // You might want to only show the "where" poll or map over all polls
  const wherePoll = polls?.polls?.[0]; // Assuming the first poll is the "where to meet" poll

  const onVote = async (pollId: string, optionIds: string[]) => {
    await fetch(`/api/meet-together/plans/${plan.id}/poll/vote`, {
      method: 'POST',
      body: JSON.stringify({
        pollId,
        optionIds,
        userType, // 'PLATFORM' or 'GUEST'
        guestId: userType === 'GUEST' ? user?.id : undefined,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const onAddOption = async (pollId: string, value: string) => {
    const res = await fetch(`/api/meet-together/plans/${plan.id}/poll/option`, {
      method: 'POST',
      body: JSON.stringify({
        pollId,
        value,
        userType, // 'PLATFORM' or 'GUEST'
        guestId: userType === 'GUEST' ? user?.id : undefined,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    console.log('Option added:', res);
  };

  if (!plan.where_to_meet && !isCreator) {
    return null; // Don't render anything if "where to meet" is not enabled and user is not creator
  }

  return (
    <div className="sticky top-16 z-10 self-start rounded-lg border px-2 py-4 md:px-4">
      {plan.where_to_meet && wherePoll ? (
        <MultipleChoiceVote
          pollName={wherePoll.name}
          pollId={wherePoll.id}
          options={wherePoll.options}
          currentUserId={currentUserId}
          isDisplayMode={userType === 'DISPLAY'}
          onAddOption={onAddOption}
          onVote={onVote}
        />
      ) : (
        isCreator && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              You can enable "Where to meet" voting for your plan.
            </p>
            <button
              className="rounded bg-dynamic-blue px-4 py-2 font-medium text-white shadow transition hover:bg-dynamic-blue/80"
              onClick={async () => {
                // call your backend here to enable where_to_meet
                // await onUpdateWhereToMeet(true);
              }}
            >
              Enable "Where to meet" voting
            </button>
          </div>
        )
      )}
    </div>
  );
}
