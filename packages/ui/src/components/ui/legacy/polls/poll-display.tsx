import {
  addPollOption,
  createPoll,
  deletePoll,
  deletePollOption,
  submitVote,
} from '@tuturuuu/apis/tumeet/actions';
import { Trash2 } from '@tuturuuu/icons';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import MultipleChoiceVote from '../tumeet/multiple-choice-vote';
import { DefaultWherePollContent } from './where-tu-meet';

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
    if (!plan.id) return;
    const result = await submitVote(plan.id, {
      pollId,
      optionIds,
      userType: userType as 'PLATFORM' | 'GUEST',
      guestId: userType === 'GUEST' ? (user?.id ?? undefined) : undefined,
    });
    if (result.error) {
      toast({
        title: 'Failed to vote',
        description: result.error,
      });
      return;
    }
  };

  const onAddOption = async (pollId: string, value: string) => {
    if (!plan.id) return null;
    const result = await addPollOption(plan.id, {
      pollId,
      value,
      userType: userType as 'PLATFORM' | 'GUEST',
      guestId: userType === 'GUEST' ? (user?.id ?? undefined) : undefined,
    });
    if (result.error) {
      toast({
        title: 'Failed to add poll option',
        description: result.error,
      });
      return null;
    }
    return result.data?.option ?? null;
  };

  const onDeleteOption = async (optionId: string) => {
    if (!plan.id) return;
    const result = await deletePollOption(plan.id, optionId, {
      userType: userType as 'PLATFORM' | 'GUEST',
    });
    if (result.error) {
      toast({
        title: 'Failed to delete poll option',
        description: result.error,
      });
    }
  };

  const onDeletePoll = async (pollId: string) => {
    if (!plan.id) return;
    const wherePoll = polls?.polls?.[0];
    if (wherePoll && wherePoll.id === pollId) {
      toast({
        title: 'Cannot delete the "Where" poll',
        description: 'Deleting the "Where" poll is not allowed',
      });
      return;
    }

    const result = await deletePoll(plan.id, pollId);
    if (result.error) {
      toast({
        title: 'Failed to delete poll',
        description: result.error,
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
    if (!plan.id || !newPollName.trim()) return;
    setCreating(true);
    const result = await createPoll(plan.id, {
      name: newPollName.trim(),
    });
    setCreating(false);
    if (result.data) {
      setNewPollName('');
      router.refresh();
    } else {
      toast({
        title: 'Failed to create poll',
        description: result.error || 'Please try again',
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
                  option.userVotes.forEach((vote) => {
                    userVoters.add(vote.user_id);
                  });
                  option.guestVotes.forEach((vote) => {
                    guestVoters.add(vote.guest_id);
                  });
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
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-dynamic-red hover:bg-dynamic-red/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePollClick(poll.id, poll.name);
                            }}
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
                          </button>
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
