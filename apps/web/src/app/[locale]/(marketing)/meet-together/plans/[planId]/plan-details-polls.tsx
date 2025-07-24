'use client';

import { useTimeBlocking } from '@/app/[locale]/(marketing)/meet-together/plans/[planId]/time-blocking-provider';
import type {
  GetPollsForPlanResult,
  MeetTogetherPlan,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import MultipleChoiceVote from '@tuturuuu/ui/legacy/tumeet/multiple-choice-vote';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('ws-polls');
  const isMobile = useIsMobile();
  if (!plan.where_to_meet && !isCreator) {
    return null; // Don't render anything if "where to meet" is not enabled and user is not creator
  }

  if (isMobile) {
    return (
      <Accordion
        type="single"
        collapsible
        className="order-first col-span-full w-full"
        defaultValue="item-1"
      >
        <AccordionItem value="item-1" className="w-full">
          <AccordionTrigger className="pl-3 text-lg">
            {t('plural')}
          </AccordionTrigger>
          <AccordionContent>
            <PlanDetailsPollContent
              plan={plan}
              isCreator={isCreator}
              platformUser={platformUser}
              polls={polls}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }
  return (
    <PlanDetailsPollContent
      plan={plan}
      isCreator={isCreator}
      platformUser={platformUser}
      polls={polls}
    />
  );
}
function PlanDetailsPollContent({
  plan,
  isCreator,
  platformUser,
  polls,
}: PlanDetailsPollsProps) {
  const t = useTranslations('ws-polls');
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
    const res = await fetch(`/api/meet-together/plans/${plan.id}/poll/vote`, {
      method: 'POST',
      body: JSON.stringify({
        pollId,
        optionIds,
        userType, // 'PLATFORM' or 'GUEST'
        guestId: userType === 'GUEST' ? user?.id : undefined,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.error('Failed to vote in poll');
      return;
    }
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
    if (!res.ok) {
      console.error('Failed to add poll option');
      return;
    }
  };

  const onDeleteOption = async (optionId: string) => {
    const res = await fetch(
      `/api/meet-together/plans/${plan.id}/poll/option/${optionId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          optionId,
          userType, // 'PLATFORM' or 'GUEST'
          //   guestId: userType === 'GUEST' ? user?.id : undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    if (!res.ok) {
      console.error('Failed to delete poll option');
    }
  };

  const onToggleWhereToMeet = async (enable: boolean) => {
    const res = await fetch(`/api/meet-together/plans/${plan.id}/where-poll`, {
      method: 'PATCH',
      body: JSON.stringify({
        planId: plan.id,
        whereToMeet: enable,
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      console.error('Failed to update "where to meet" setting');
    }
  };

  return (
    <div className="top-16 z-10 self-start rounded-lg border px-2 py-4 md:sticky md:px-4">
      {plan.where_to_meet && wherePoll ? (
        <MultipleChoiceVote
          isCreator={isCreator}
          pollName={wherePoll.name}
          pollId={wherePoll.id}
          options={wherePoll.options}
          currentUserId={currentUserId}
          isDisplayMode={userType === 'DISPLAY'}
          onAddOption={onAddOption}
          onVote={onVote}
          onDeleteOption={onDeleteOption}
        />
      ) : (
        isCreator && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              {t('enable_where_poll_desc')}
            </p>
            <button
              className="rounded bg-dynamic-blue px-4 py-2 font-medium text-white shadow transition hover:bg-dynamic-blue/80"
              onClick={async () => await onToggleWhereToMeet(true)}
            >
              {t('enable_where_poll')}
            </button>
          </div>
        )
      )}
    </div>
  );
}
