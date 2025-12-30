'use client';

/**
 * Enhanced Multiple Choice Vote Component
 *
 * Features:
 * - Displays voter names for each option
 * - Mobile-friendly collapsible voter lists
 * - Responsive design for touch devices
 * - Shows both platform users and guests who voted
 * - Anonymous fallback for users without display names
 */
import { ChevronDown, ChevronRight, Trash2, Users } from '@tuturuuu/icons';
import type {
  GuestVoteWithGuestInfo,
  PollOptionWithVotes,
  UserVoteWithUserInfo,
} from '@tuturuuu/types/primitives/Poll';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTimeBlocking } from '@tuturuuu/ui/hooks/time-blocking-provider';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface MultipleChoiceVoteProps {
  pollId: string;
  pollName: string;
  options: PollOptionWithVotes[];
  currentUserId: string | null;
  isCreator?: boolean;
  isDisplayMode?: boolean;
  onVote: (pollId: string, optionIds: string[]) => Promise<void>;
  onAddOption: (
    pollId: string,
    value: string
  ) => Promise<PollOptionWithVotes | null>;
  onDeleteOption: (optionId: string) => Promise<void>;
  className?: string;
  hideHeader?: boolean;
}

function arraysAreEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const val of b) {
    if (!setA.has(val)) return false;
  }
  return true;
}

// Component to display voter names in a mobile-friendly way
function VoterList({
  userVotes,
  guestVotes,
  isExpanded,
  onToggle,
}: {
  userVotes: UserVoteWithUserInfo[];
  guestVotes: GuestVoteWithGuestInfo[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('ws-polls');
  const allVoters = [
    ...userVotes
      .filter((vote) => vote.user) // Filter out votes without user info
      .map((vote) => ({
        name: vote.user?.display_name || 'Anonymous',
        type: 'user' as const,
      })),
    ...guestVotes
      .filter((vote) => vote.guest) // Filter out votes without guest info
      .map((vote) => ({
        name: vote.guest?.display_name || 'Anonymous',
        type: 'guest' as const,
      })),
  ];

  if (allVoters.length === 0) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex h-auto w-full touch-manipulation justify-start gap-1 p-2 text-muted-foreground text-xs hover:text-foreground"
        >
          <Users className="h-3 w-3" />
          <span>
            {allVoters.length}{' '}
            {allVoters.length === 1 ? t('voter') : t('voters')}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="max-h-32 overflow-y-auto pl-4">
          <div className="grid grid-cols-2 gap-2">
            {allVoters.map((voter, index) => (
              <div
                key={index}
                className="flex items-center gap-2 py-0.5 text-muted-foreground text-xs"
              >
                <div className="flex h-2 w-2 shrink-0 rounded-full bg-dynamic-purple/60" />
                <span className="min-w-0 truncate">
                  {voter.name || 'Anonymous'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MultipleChoiceVote({
  pollId,
  pollName,
  options,
  currentUserId,
  isCreator = false,
  isDisplayMode = false,
  onVote,
  onAddOption,
  onDeleteOption,
  className,
  hideHeader = false,
}: MultipleChoiceVoteProps) {
  const t = useTranslations('ws-polls');
  const { user } = useTimeBlocking();

  // --- Local optimistic state
  const [optionsState, setOptionsState] = useState(options);

  useEffect(() => {
    setOptionsState(options);
  }, [options]);

  const [customOption, setCustomOption] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<null | string>(null);
  const [expandedVoters, setExpandedVoters] = useState<Set<string>>(new Set());

  // Memoize user's voted options (previous votes from backend)
  const votedOptionIds = useMemo(() => {
    if (!currentUserId) return [];
    return optionsState
      .filter(
        (opt) =>
          opt.userVotes.some((v) => v.user_id === currentUserId) ||
          opt.guestVotes.some((v) => v.guest_id === currentUserId)
      )
      .map((opt) => opt.id);
  }, [optionsState, currentUserId]);

  // On mount/options change: set selected to previous votes (if any)
  useEffect(() => {
    setSelectedOptionIds(votedOptionIds);
  }, [votedOptionIds]);

  // Calculate unique voters across all options to avoid double counting
  const uniqueVoters = useMemo(() => {
    const userVoters = new Set<string>();
    const guestVoters = new Set<string>();

    for (const option of optionsState) {
      for (const vote of option.userVotes) {
        userVoters.add(vote.user_id);
      }
      for (const vote of option.guestVotes) {
        guestVoters.add(vote.guest_id);
      }
    }

    return userVoters.size + guestVoters.size;
  }, [optionsState]);

  // Sort options by vote amount in descending order
  const sortedOptions = useMemo(() => {
    return [...optionsState].sort((a, b) => b.totalVotes - a.totalVotes);
  }, [optionsState]);

  // Add option
  const canAdd =
    !!customOption.trim() &&
    !optionsState.some((opt) => opt.value === customOption.trim());

  const handleAddOption = async () => {
    const trimmed = customOption.trim();
    if (!trimmed || !canAdd) return;
    const previousState = optionsState;

    // Optimistic UI update
    const newOptionId = crypto.randomUUID();
    const fakeOption: PollOptionWithVotes = {
      id: newOptionId,
      poll_id: pollId,
      value: trimmed,
      created_at: new Date().toISOString(),
      userVotes: currentUserId
        ? [
            {
              id: crypto.randomUUID(),
              option_id: newOptionId,
              user_id: currentUserId,
              created_at: new Date().toISOString(),
              user: { display_name: user?.display_name ?? '' },
            },
          ]
        : [],
      guestVotes: [],
      totalVotes: currentUserId ? 1 : 0,
    };
    setOptionsState((prev) => [...prev, fakeOption]);
    setCustomOption('');
    setSelectedOptionIds((prev) => [...prev, newOptionId]);
    try {
      const realOption = await onAddOption(pollId, trimmed);
      if (realOption) {
        setOptionsState((prev) =>
          prev.map((opt) => (opt.id === newOptionId ? realOption : opt))
        );
        setSelectedOptionIds((prev) =>
          prev.map((id) => (id === newOptionId ? realOption.id : id))
        );
      } else {
        setOptionsState(previousState); // Revert state on failure
      }
    } catch (error) {
      console.error('Failed to add option:', error);
      setOptionsState(previousState); // Revert state on failure
      // Optionally, show a toast notification to the user
    }
  };

  // Option toggle (checkbox)
  const handleToggleOption = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  // Toggle voter list expansion
  const toggleVoterExpansion = (optionId: string) => {
    setExpandedVoters((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(optionId)) {
        newSet.delete(optionId);
      } else {
        newSet.add(optionId);
      }
      return newSet;
    });
  };

  // Confirm enable logic
  const hasChanges = !arraysAreEqual(selectedOptionIds, votedOptionIds);

  // Confirm vote (optimistic update)
  const handleVoteConfirm = async () => {
    if (hasChanges) {
      const previousState = optionsState;
      setOptionsState((prev) =>
        prev.map((option) => {
          const wasVoted =
            option.userVotes.some((v) => v.user_id === currentUserId) ||
            option.guestVotes.some((v) => v.guest_id === currentUserId);
          const willBeVoted = selectedOptionIds.includes(option.id);

          let newUserVotes = option.userVotes;
          let newGuestVotes = option.guestVotes;

          if (currentUserId) {
            if (wasVoted && !willBeVoted) {
              newUserVotes = newUserVotes.filter(
                (v) => v.user_id !== currentUserId
              );
              newGuestVotes = newGuestVotes.filter(
                (v) => v.guest_id !== currentUserId
              );
            }
            if (!wasVoted && willBeVoted) {
              newUserVotes = [
                ...newUserVotes,
                {
                  id: crypto.randomUUID(),
                  option_id: option.id,
                  user_id: currentUserId,
                  created_at: new Date().toISOString(),
                  user: { display_name: user?.display_name ?? '' },
                },
              ];
            }
          }

          const totalVotes =
            (newUserVotes?.length ?? 0) + (newGuestVotes?.length ?? 0);

          return {
            ...option,
            userVotes: newUserVotes,
            guestVotes: newGuestVotes,
            totalVotes,
          };
        })
      );
      try {
        await onVote(pollId, selectedOptionIds);
      } catch (error) {
        console.error('Failed to submit vote:', error);
        setOptionsState(previousState);
        // Optionally show an error toast/notification
      }
    }
    setConfirmOpen(false);
  };

  // Delete option (creator only)
  const handleDeleteOption = async (optionId: string) => {
    const previousState = optionsState;
    setOptionsState((prev) => prev.filter((o) => o.id !== optionId));
    setDeleteDialog(null);
    try {
      await onDeleteOption(optionId);
    } catch (error) {
      console.error('Failed to delete option:', error);
      setOptionsState(previousState);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-dynamic-purple text-lg">
              {pollName}
            </h3>
            {uniqueVoters > 0 && (
              <p className="text-muted-foreground text-xs">
                {uniqueVoters} {uniqueVoters === 1 ? t('voter') : t('voters')}
              </p>
            )}
          </div>
        </div>
      )}
      {!isDisplayMode && (
        <div className="text-foreground text-sm">{t('select_options')}</div>
      )}
      <div className="space-y-2">
        {sortedOptions.map((option) => {
          const isSelected = selectedOptionIds.includes(option.id);
          const isVoterExpanded = expandedVoters.has(option.id);

          return (
            <div key={option.id} className="flex flex-col gap-2">
              <button
                type="button"
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between rounded-lg border p-3',
                  'touch-manipulation border-dynamic-purple/50',
                  isSelected &&
                    !isDisplayMode &&
                    'border-dynamic-purple bg-dynamic-purple/10'
                )}
                onClick={() => !isDisplayMode && handleToggleOption(option.id)}
              >
                <div className="flex w-full cursor-pointer items-start gap-2">
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisplayMode}
                    onCheckedChange={() =>
                      !isDisplayMode && handleToggleOption(option.id)
                    }
                    id={`option-${option.id}`}
                    className="mt-0.5 data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                  />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={`option-${option.id}`}
                      className={cn(
                        'block cursor-pointer font-medium text-sm',
                        isSelected && !isDisplayMode && 'text-dynamic-purple'
                      )}
                    >
                      {option.value}
                    </label>
                  </div>
                </div>

                <div className="ml-2 flex min-w-[80px] shrink-0 flex-col items-end justify-between sm:min-w-[90px]">
                  <span
                    className={cn(
                      'w-full text-center text-dynamic-purple text-xs'
                    )}
                  >
                    {option.totalVotes} {t('votes')}
                  </span>
                  <Progress
                    value={
                      uniqueVoters > 0
                        ? (option.totalVotes / uniqueVoters) * 100
                        : 0
                    }
                    className="mt-1 h-2 w-16 bg-foreground/30 sm:w-20"
                    indicatorClassName="bg-dynamic-purple"
                  />
                </div>

                {isCreator && !isDisplayMode && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-2 text-dynamic-red hover:bg-dynamic-red/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialog(option.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </button>
              {/* Voter list - mobile friendly */}
              <VoterList
                userVotes={option.userVotes}
                guestVotes={option.guestVotes}
                isExpanded={isVoterExpanded}
                onToggle={() => toggleVoterExpansion(option.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Add new option */}
      {!isDisplayMode && (
        <div className="flex gap-2">
          <Input
            placeholder={t('create_new_option')}
            value={customOption}
            onChange={(e) => setCustomOption(e.target.value)}
            className="w-full border-dynamic-purple"
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && canAdd) await handleAddOption();
            }}
            disabled={false}
          />
          <Button
            type="button"
            variant="outline"
            className="border-dynamic-purple text-dynamic-purple"
            onClick={handleAddOption}
            disabled={!canAdd}
          >
            {t('add')}
          </Button>
        </div>
      )}

      {/* Action button: Confirm only */}
      {!isDisplayMode && (
        <Button
          type="button"
          className={cn(
            'w-full border border-dynamic-purple bg-transparent text-foreground hover:bg-dynamic-purple/30',
            hasChanges
              ? 'border-dynamic-purple text-dynamic-purple'
              : 'cursor-not-allowed opacity-50'
          )}
          onClick={() => hasChanges && setConfirmOpen(true)}
          disabled={!hasChanges}
        >
          {t('confirm')}
        </Button>
      )}

      {/* Confirm modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('vote_for')}{' '}
              {selectedOptionIds.length === 1
                ? `"${optionsState.find((o) => o.id === selectedOptionIds[0])?.value ?? ''}"`
                : selectedOptionIds
                    .map(
                      (id) =>
                        `"${optionsState.find((o) => o.id === id)?.value ?? ''}"`
                    )
                    .join(', ')}
              ?
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">{t('vote_confirm')}</div>
          <DialogFooter>
            <Button
              onClick={handleVoteConfirm}
              className="border border-dynamic-purple bg-transparent text-foreground hover:bg-dynamic-purple/30"
            >
              {t('confirm')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete option modal */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_option')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">{t('delete_option_confirm')}</div>
          <DialogFooter>
            <Button
              onClick={() => deleteDialog && handleDeleteOption(deleteDialog)}
              className="bg-dynamic-red text-background"
            >
              {t('delete')}
            </Button>
            <Button variant="ghost" onClick={() => setDeleteDialog(null)}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
