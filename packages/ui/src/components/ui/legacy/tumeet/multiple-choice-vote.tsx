'use client';

import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

export interface PollOptionWithVotes {
  id: string;
  poll_id: string;
  value: string;
  created_at: string;
  userVotes: { user_id: string }[];
  guestVotes: { guest_id: string }[];
  totalVotes: number;
}

interface MultipleChoiceVoteProps {
  pollId: string;
  pollName: string;
  options: PollOptionWithVotes[];
  currentUserId: string | null;
  isCreator?: boolean;
  isDisplayMode?: boolean;
  onVote: (pollId: string, optionIds: string[]) => Promise<void>;
  onAddOption: (pollId: string, value: string) => Promise<void>;
  onDeleteOption: (optionId: string) => Promise<void>;
  className?: string;
}

function arraysAreEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const val of b) {
    if (!setA.has(val)) return false;
  }
  return true;
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
}: MultipleChoiceVoteProps) {
  const t = useTranslations('ws-polls');

  // --- Local optimistic state
  const [optionsState, setOptionsState] = useState(options);

  useEffect(() => {
    setOptionsState(options);
  }, [options]);

  const [customOption, setCustomOption] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<null | string>(null);

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
  }, [votedOptionIds.join(','), optionsState.length]);

  const totalVotesAll = optionsState.reduce((s, o) => s + o.totalVotes, 0);

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
    setOptionsState((prev) => [
      ...prev,
      {
        id: newOptionId,
        poll_id: pollId,
        value: trimmed,
        created_at: new Date().toISOString(),
        userVotes: currentUserId ? [{ user_id: currentUserId }] : [],
        guestVotes: [],
        totalVotes: currentUserId ? 1 : 0,
      },
    ]);
    setCustomOption('');
    setSelectedOptionIds((prev) => [...prev, newOptionId]);
    try {
      await onAddOption(pollId, trimmed);
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
              newUserVotes = [...newUserVotes, { user_id: currentUserId }];
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
    setOptionsState((prev) => prev.filter((o) => o.id !== optionId));
    setDeleteDialog(null);
    await onDeleteOption(optionId);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-lg font-semibold text-dynamic-purple">{pollName}</h3>
      {!isDisplayMode && (
        <div className="text-sm text-foreground">{t('select_options')}</div>
      )}
      <div className="space-y-2">
        {optionsState.map((option) => {
          const isSelected = selectedOptionIds.includes(option.id);
          return (
            <div
              key={option.id}
              className={cn(
                'flex items-center justify-between rounded-lg border p-2',
                'border-dynamic-purple/50',
                isSelected &&
                  !isDisplayMode &&
                  'border-dynamic-purple bg-dynamic-purple/10'
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isSelected}
                  disabled={isDisplayMode}
                  onCheckedChange={() =>
                    !isDisplayMode && handleToggleOption(option.id)
                  }
                  id={`option-${option.id}`}
                  className="data-[state=checked]:border-dynamic-purple data-[state=checked]:bg-dynamic-purple"
                />
                <label
                  htmlFor={`option-${option.id}`}
                  className={cn(
                    'text-sm font-medium',
                    isSelected && !isDisplayMode && 'text-dynamic-purple'
                  )}
                >
                  {option.value}
                </label>
              </div>
              <div className="flex min-w-[90px] flex-col items-end">
                <span
                  className={cn(
                    'w-full text-xs text-dynamic-purple',
                    isCreator ? 'text-center' : 'text-left'
                  )}
                >
                  {option.totalVotes} {t('votes')}
                </span>
                <Progress
                  value={
                    totalVotesAll > 0
                      ? (option.totalVotes / totalVotesAll) * 100
                      : 0
                  }
                  className="mt-1 h-2 w-20 bg-foreground/30"
                  indicatorClassName="bg-dynamic-purple"
                />
              </div>
              {isCreator && !isDisplayMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 text-dynamic-red hover:bg-dynamic-red/10"
                  onClick={() => setDeleteDialog(option.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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
