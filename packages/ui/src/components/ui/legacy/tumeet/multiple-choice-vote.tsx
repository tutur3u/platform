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
  isDisplayMode?: boolean;
  onVote: (pollId: string, optionIds: string[]) => Promise<void>;
  onAddOption: (pollId: string, value: string) => Promise<void>;
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
  isDisplayMode = false,
  onVote,
  onAddOption,
  className,
}: MultipleChoiceVoteProps) {
  const t = useTranslations('ws-polls');

  // --- Local optimistic state
  const [optionsState, setOptionsState] = useState(options);

  useEffect(() => {
    setOptionsState(options);
  }, [options]);

  // Add option
  const [customOption, setCustomOption] = useState('');
  const [voting, setVoting] = useState(false);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Memoize user's voted options
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

  const totalVotesAll = optionsState.reduce((s, o) => s + o.totalVotes, 0);

  // Add option
  const canAdd =
    !!customOption.trim() &&
    !optionsState.some((opt) => opt.value === customOption.trim());

  const handleAddOption = async () => {
    const trimmed = customOption.trim();
    if (!trimmed || !canAdd) return;

    // --- Optimistic local update ---
    const newOptionId = `temp-${Date.now()}`; // temporary unique id for UI
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

    // --- Backend sync (waits for real DB id) ---
    await onAddOption(pollId, trimmed);
  };

  // Start voting (preserve previous votes)
  const handleVoteButton = () => {
    setVoting(true);
    setSelectedOptionIds(votedOptionIds);
  };

  // Option toggle (checkbox)
  const handleToggleOption = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  // Confirm vote (optimistic update)
  const handleVoteConfirm = async () => {
    if (!arraysAreEqual(selectedOptionIds, votedOptionIds)) {
      // --- Optimistically update options state ---
      setOptionsState((prev) =>
        prev.map((option) => {
          const wasVoted =
            option.userVotes.some((v) => v.user_id === currentUserId) ||
            option.guestVotes.some((v) => v.guest_id === currentUserId);
          const willBeVoted = selectedOptionIds.includes(option.id);

          // Only adjust userVotes for current user
          let newUserVotes = option.userVotes;
          let newGuestVotes = option.guestVotes;

          if (currentUserId) {
            // Remove previous vote if user had voted and is now unselected
            if (wasVoted && !willBeVoted) {
              newUserVotes = newUserVotes.filter(
                (v) => v.user_id !== currentUserId
              );
              newGuestVotes = newGuestVotes.filter(
                (v) => v.guest_id !== currentUserId
              );
            }
            // Add vote if not voted before and now selected
            if (!wasVoted && willBeVoted) {
              // You can use a user/guestType flag if you want more precise type checks
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
      // --- Backend sync ---
      await onVote(pollId, selectedOptionIds);
    }
    setVoting(false);
    setConfirmOpen(false);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-lg font-semibold">{pollName}</h3>

      {/* Options list */}
      {!isDisplayMode && (
        <div className="text-sm text-foreground/70">{t('select_options')}</div>
      )}
      <div className="space-y-2">
        {optionsState.map((option) => {
          const isSelected = voting
            ? selectedOptionIds.includes(option.id)
            : votedOptionIds.includes(option.id);
          return (
            <div
              key={option.id}
              className={cn(
                'flex items-center justify-between rounded-lg border p-2',
                isSelected &&
                  !isDisplayMode &&
                  'border-dynamic-blue bg-dynamic-blue/5'
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={isSelected}
                  disabled={
                    isDisplayMode || (!voting && votedOptionIds.length === 0)
                  }
                  onCheckedChange={() =>
                    voting && handleToggleOption(option.id)
                  }
                  id={`option-${option.id}`}
                />
                <label
                  htmlFor={`option-${option.id}`}
                  className={cn(
                    'text-sm font-medium',
                    isSelected && !isDisplayMode && 'text-dynamic-blue'
                  )}
                >
                  {option.value}
                </label>
              </div>
              <div className="flex min-w-[90px] flex-col items-end">
                <span className="text-xs text-foreground/70">
                  {option.totalVotes} {t('votes')}
                </span>
                <Progress
                  value={
                    totalVotesAll > 0
                      ? (option.totalVotes / totalVotesAll) * 100
                      : 0
                  }
                  className="mt-1 h-2 w-20"
                />
              </div>
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
            className="w-full"
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && canAdd) await handleAddOption();
            }}
            disabled={voting && votedOptionIds.length > 0}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleAddOption}
            disabled={!canAdd}
          >
            {t('add')}
          </Button>
        </div>
      )}

      {/* Action buttons */}
      {!isDisplayMode && (
        <>
          {votedOptionIds.length === 0 && !voting && (
            <Button
              type="button"
              className="w-full"
              onClick={handleVoteButton}
              disabled={isDisplayMode}
            >
              {t('vote')}
            </Button>
          )}
          {votedOptionIds.length > 0 && !voting && (
            <div className="flex flex-col items-center gap-2">
              <div className="text-center text-sm font-medium text-dynamic-green">
                {t('voted_for')}{' '}
                {votedOptionIds.length === 1
                  ? `"${optionsState.find((o) => o.id === votedOptionIds[0])?.value ?? ''}"`
                  : votedOptionIds
                      .map(
                        (id) =>
                          `"${optionsState.find((o) => o.id === id)?.value ?? ''}"`
                      )
                      .join(', ')}
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleVoteButton}
              >
                {t('vote_again')}
              </Button>
            </div>
          )}
          {voting && (
            <Button
              type="button"
              className="w-full"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedOptionIds.length === 0}
            >
              {t('confirm')}
            </Button>
          )}
        </>
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
            <Button onClick={handleVoteConfirm}>{t('confirm')}</Button>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
