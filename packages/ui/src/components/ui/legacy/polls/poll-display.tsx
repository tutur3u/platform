import MultipleChoiceVote from '../tumeet/multiple-choice-vote';
import { DefaultWherePollContent } from './where-tu-meet';
import {
  GetPollsForPlanResult,
  MeetTogetherPlan,
} from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface PlanDetailsPollContentProps {
  plan: MeetTogetherPlan;
  isCreator: boolean;
  platformUser: User | null;
  polls: GetPollsForPlanResult | null;
}

export function PlanDetailsPollContent({
  plan,
  isCreator,
  platformUser,
  polls,
}: PlanDetailsPollContentProps) {
  const t = useTranslations('ws-polls');
  const { user: guestUser } = useTimeBlocking();
  // State for new poll input
  const [newPollName, setNewPollName] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

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
      toast({
        title: 'Failed to vote',
        description: 'Please try again',
      });
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
      toast({
        title: 'Failed to add poll option',
        description: 'Please try again',
      });
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
        }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
    if (!res.ok) {
      toast({
        title: 'Failed to delete poll option',
        description: 'Please try again',
      });
    }
  };

  const onDeletePoll = async (pollId: string) => {
    const wherePoll = polls?.polls?.[0];
    if (wherePoll && wherePoll.id === pollId) {
      toast({
        title: 'Cannot delete the "Where" poll',
        description: 'Deleting the "Where" poll is not allowed',
      });
      return;
    }

    const res = await fetch(`/api/meet-together/plans/${plan.id}/poll`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pollId,
      }),
    });
    if (!res.ok) {
      toast({
        title: 'Failed to delete poll',
        description: 'Please try again',
      });
      return;
    }
    router.refresh();
  };

  const onAddPoll = async () => {
    if (!newPollName.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/meet-together/plans/${plan.id}/poll`, {
      method: 'POST',
      body: JSON.stringify({
        name: newPollName.trim(),
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    setCreating(false);
    if (res.ok) {
      setNewPollName('');
      router.refresh();
    } else {
      toast({
        title: 'Failed to create poll',
        description: 'Please try again',
      });
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
        onDeletePoll={onDeletePoll}
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
              onDeletePoll={onDeletePoll}
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
