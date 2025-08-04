import MultipleChoiceVote from '../tumeet/multiple-choice-vote';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type {
  GetPollsForPlanResult,
  PollOptionWithVotes,
} from '@tuturuuu/types/primitives/Poll';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';

export function DefaultWherePollContent({
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
  onAddOption: (
    pollId: string,
    value: string
  ) => Promise<PollOptionWithVotes | null>;
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
      toast({
        title: 'Failed to toggle where to meet',
        description: 'Please try again',
      });
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
