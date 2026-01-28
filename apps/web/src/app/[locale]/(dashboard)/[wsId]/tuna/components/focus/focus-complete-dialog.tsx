'use client';

import {
  CheckCircle2,
  Clock,
  PartyPopper,
  Sparkles,
  Star,
  Trophy,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useState } from 'react';
import type { TunaAchievement, TunaFocusSession } from '../../types/tuna';

interface FocusCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: TunaFocusSession | null;
  xpEarned: number;
  achievementsUnlocked: TunaAchievement[];
  onSubmit: (notes?: string) => void;
  isLoading?: boolean;
}

export function FocusCompleteDialog({
  open,
  onOpenChange,
  session,
  xpEarned,
  achievementsUnlocked,
  onSubmit,
  isLoading = false,
}: FocusCompleteDialogProps) {
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onSubmit(notes.trim() || undefined);
    setNotes('');
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const isCompleted = session?.completed ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <motion.div
            className="mx-auto mb-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            {isCompleted ? (
              <div className="inline-flex rounded-full bg-dynamic-green/20 p-3">
                <PartyPopper className="h-10 w-10 text-dynamic-green" />
              </div>
            ) : (
              <div className="inline-flex rounded-full bg-dynamic-yellow/20 p-3">
                <CheckCircle2 className="h-10 w-10 text-dynamic-yellow" />
              </div>
            )}
          </motion.div>
          <DialogTitle className="text-xl">
            {isCompleted ? 'Amazing Work!' : 'Session Ended'}
          </DialogTitle>
          <DialogDescription>
            {isCompleted
              ? 'You crushed it! Tuna is so proud of you.'
              : 'Good effort! Every bit of focus counts.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <Clock className="mx-auto mb-1 h-5 w-5 text-muted-foreground" />
              <p className="font-bold text-2xl">
                {formatDuration(session?.actual_duration ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">Focus Time</p>
            </div>
            <div className="rounded-lg bg-dynamic-yellow/10 p-3 text-center">
              <Star className="mx-auto mb-1 h-5 w-5 text-dynamic-yellow" />
              <p className="font-bold text-2xl">+{xpEarned}</p>
              <p className="text-muted-foreground text-xs">XP Earned</p>
            </div>
          </div>

          {/* Goal reminder if set */}
          {session?.goal && (
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="mb-1 font-medium text-muted-foreground text-xs">
                Your goal was:
              </p>
              <p className="text-sm">{session.goal}</p>
            </div>
          )}

          {/* Achievements unlocked */}
          {achievementsUnlocked.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-dynamic-yellow" />
                <span className="font-medium text-sm">
                  Achievements Unlocked!
                </span>
              </div>
              <div className="space-y-2">
                {achievementsUnlocked.map((achievement) => (
                  <motion.div
                    key={achievement.id}
                    className="flex items-center gap-3 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-2"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Sparkles className="h-5 w-5 text-dynamic-yellow" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{achievement.name}</p>
                      <p className="text-muted-foreground text-xs">
                        +{achievement.xp_reward} XP
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Reflection */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm">
              How did it go? (optional)
            </Label>
            <Textarea
              id="notes"
              placeholder="What did you accomplish? Any thoughts to capture?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className={cn(
              'w-full gap-2',
              isCompleted
                ? 'bg-dynamic-green hover:bg-dynamic-green/90'
                : 'bg-dynamic-blue hover:bg-dynamic-blue/90'
            )}
          >
            {isLoading ? 'Saving...' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
