import MultipleChoiceVote from '../tumeet/multiple-choice-vote';
import { DefaultWherePollContent } from './where-tu-meet';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import type { GetPollsForPlanResult } from '@tuturuuu/types/primitives/Poll';
import type { User } from '@tuturuuu/types/primitives/User';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Trash2 } from 'lucide-react';
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
  // State for accordion - track which polls are expanded
  const [expandedPolls, setExpandedPolls] = useState<string[]>([]);
  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pollToDelete, setPollToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const router = useRouter();

  const user = guestUser ?? platformUser;
  const currentUserId = user?.id ?? null;
  let userType: 'GUEST' | 'PLATFORM' | 'DISPLAY' =
    user?.is_guest === true
      ? 'GUEST'
      : platformUser?.id
        ? 'PLATFORM'
        : 'DISPLAY';

  if (plan.is_confirmed) {
    userType = 'DISPLAY'; // Guests cannot vote if the plan is confirmed
  }

  const otherPolls = polls?.polls?.slice(1) ?? [];

  // Helper functions for accordion management
  const expandAllPolls = () => {
    setExpandedPolls(otherPolls.map((poll) => poll.id));
  };

  const collapseAllPolls = () => {
    setExpandedPolls([]);
  };

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

  const handleDeletePollClick = (pollId: string, pollName: string) => {
    const wherePoll = polls?.polls?.[0];
    if (wherePoll && wherePoll.id === pollId) {
      toast({
        title: 'Cannot delete the "Where" poll',
        description: 'Deleting the "Where" poll is not allowed',
      });
      return;
    }

    setPollToDelete({ id: pollId, name: pollName });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pollToDelete) return;

    await onDeletePoll(pollToDelete.id);
    setDeleteDialogOpen(false);
    setPollToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
    setPollToDelete(null);
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
      />
      {/* ADDITIONAL POLLS */}
      {otherPolls.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-base text-foreground">
              {/* {t('other_polls')} */}
              Other Polls
            </h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAllPolls}
                className="text-xs"
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAllPolls}
                className="text-xs"
              >
                Collapse All
              </Button>
            </div>
          </div>
          <Accordion
            type="multiple"
            value={expandedPolls}
            onValueChange={setExpandedPolls}
            className="space-y-2"
          >
            {otherPolls.map((poll) => {
              // Calculate unique voters for this poll
              const uniqueVoters = (() => {
                const userVoters = new Set<string>();
                const guestVoters = new Set<string>();

                poll.options.forEach((option) => {
                  option.userVotes.forEach((vote) =>
                    userVoters.add(vote.user_id)
                  );
                  option.guestVotes.forEach((vote) =>
                    guestVoters.add(vote.guest_id)
                  );
                });

                return userVoters.size + guestVoters.size;
              })();

              return (
                <AccordionItem key={poll.id} value={poll.id}>
                  <AccordionTrigger className="items-center hover:no-underline">
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <span className="font-semibold text-dynamic-purple text-lg">
                            {poll.name}
                          </span>
                          {uniqueVoters > 0 && (
                            <p className="text-muted-foreground text-xs">
                              {uniqueVoters}{' '}
                              {uniqueVoters === 1 ? 'voter' : 'voters'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">
                          {poll.options.length} options
                        </span>
                        {isCreator && !plan.is_confirmed && (
                          <div
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-dynamic-red hover:bg-dynamic-red/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePollClick(poll.id, poll.name);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeletePollClick(poll.id, poll.name);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <MultipleChoiceVote
                      isCreator={isCreator}
                      pollName={poll.name}
                      pollId={poll.id}
                      options={poll.options}
                      currentUserId={currentUserId}
                      isDisplayMode={userType === 'DISPLAY'}
                      onAddOption={onAddOption}
                      onVote={onVote}
                      onDeleteOption={onDeleteOption}
                      className="pt-2"
                      hideHeader={true}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
      {isCreator && !plan.is_confirmed && (
        <div className="mt-8 space-y-2">
          <h4 className="mb-2 font-semibold text-base text-foreground">
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Poll</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pollToDelete?.name}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
