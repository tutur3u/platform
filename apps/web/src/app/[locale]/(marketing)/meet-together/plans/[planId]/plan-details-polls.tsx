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
import { Button } from '@tuturuuu/ui/button';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { Input } from '@tuturuuu/ui/input';
import MultipleChoiceVote from '@tuturuuu/ui/legacy/tumeet/multiple-choice-vote';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  // State for new poll input
  const [newPollName, setNewPollName] = useState('');
  const [creating, setCreating] = useState(false);

  const user = guestUser ?? platformUser;
  const currentUserId = user?.id ?? null;
  const userType =
    user?.is_guest === true
      ? 'GUEST'
      : platformUser?.id
        ? 'PLATFORM'
        : 'DISPLAY';

  const otherPolls = polls?.polls?.slice(1) ?? [];

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
      return null;
    }
    const data = await res.json();
    return data.option;
  };

  const onDeleteOption = async (optionId: string) => {
    const res = await fetch(
      `/api/meet-together/plans/${plan.id}/poll/option/${optionId}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
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

  const onAddPoll = async () => {
    if (!newPollName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/meet-together/plans/${plan.id}/poll`, {
      method: 'POST',
      body: JSON.stringify({
        planId: plan.id,
        name: newPollName.trim(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    setCreating(false);
    if (res.ok) {
      setNewPollName('');
      // Ideally refetch poll list here or update state (e.g., call mutate())
      window.location.reload(); // Simple fallback; replace with your data reload logic if needed
    } else {
      // Optionally, show error
      alert('Failed to create poll');
    }
  };

  return (
    <div className="top-16 z-10 self-start rounded-lg border px-2 py-4 md:sticky md:px-4">
      <DefaultWherePollContent
        plan={plan}
        isCreator={isCreator}
        polls={polls}
        currentUserId={currentUserId}
        userType={userType}
        onAddOption={onAddOption}
        onVote={onVote}
        onDeleteOption={onDeleteOption}
      />
      {/* ADDITIONAL POLLS */}
      {otherPolls.length > 0 && (
        <div className="mt-8 space-y-6">
          <h4 className="mb-2 text-base font-semibold text-foreground">
            {/* {t('other_polls')} */}
            Other Polls
          </h4>
          {otherPolls.map((poll) => (
            <MultipleChoiceVote
              key={poll.id}
              isCreator={isCreator}
              pollName={poll.name}
              pollId={poll.id}
              options={poll.options}
              currentUserId={currentUserId}
              isDisplayMode={userType === 'DISPLAY'}
              onAddOption={onAddOption}
              onVote={onVote}
              onDeleteOption={onDeleteOption}
              className="border-t pt-4"
            />
          ))}
        </div>
      )}
      {isCreator && (
        <div className="mt-8 space-y-2">
          <h4 className="mb-2 text-base font-semibold text-foreground">
            {/* {t('add_new_poll')} */}
            Add New Poll
          </h4>
          <div className="flex gap-2">
            <Input
              value={newPollName}
              onChange={(e) => setNewPollName(e.target.value)}
              //   placeholder={t('poll_name_placeholder')}
              placeholder={'Poll Name'}
              className="w-full border-dynamic-purple/50"
              disabled={creating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newPollName.trim() && !creating)
                  onAddPoll();
              }}
            />
            <Button
              onClick={onAddPoll}
              disabled={!newPollName.trim() || creating}
              className="border-dynamic-purple/50 text-dynamic-purple"
              variant="outline"
            >
              {t('add')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DefaultWherePollContent({
  plan,
  isCreator,
  polls,
  currentUserId,
  userType,
  onAddOption,
  onVote,
  onDeleteOption,
}: {
  plan: MeetTogetherPlan;
  isCreator: boolean;
  polls: GetPollsForPlanResult | null;
  currentUserId: string | null;
  userType: 'PLATFORM' | 'GUEST' | 'DISPLAY';
  onAddOption: (pollId: string, value: string) => Promise<any>;
  onVote: (pollId: string, optionIds: string[]) => Promise<void>;
  onDeleteOption: (optionId: string) => Promise<void>;
}) {
  const t = useTranslations('ws-polls');
  if (!plan.where_to_meet && !isCreator) {
    return null; // Don't render anything if "where to meet" is not enabled and user is not creator
  }

  const wherePoll = polls?.polls?.[0]; // Assuming the first poll is the "where to meet" poll

  const onToggleWhereToMeet = async (enable: boolean) => {
    const res = await fetch(
      `/api/meet-together/plans/${plan.id}/poll/where-poll`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          planId: plan.id,
          whereToMeet: enable,
        }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!res.ok) {
      console.error('Failed to update "where to meet" setting');
    }
  };

  if (plan.where_to_meet && wherePoll)
    return (
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
    );
  else if (isCreator) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-500">{t('enable_where_poll_desc')}</p>
        <button
          className="rounded border border-dynamic-purple bg-dynamic-purple/20 px-4 py-2 font-medium text-foreground shadow transition hover:bg-dynamic-purple/40"
          onClick={async () => await onToggleWhereToMeet(true)}
        >
          {t('enable_where_poll')}
        </button>
      </div>
    );
  }
}
