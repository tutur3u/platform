'use client';

import { Sparkles, Target, Timer } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { FOCUS_DURATION_PRESETS } from '../../types/tuna';

interface FocusStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (duration: number, goal?: string) => void;
  isLoading?: boolean;
}

export function FocusStartDialog({
  open,
  onOpenChange,
  onStart,
  isLoading = false,
}: FocusStartDialogProps) {
  const [duration, setDuration] = useState<number>(25);
  const [goal, setGoal] = useState('');

  const handleStart = () => {
    onStart(duration, goal.trim() || undefined);
    setGoal('');
    setDuration(25);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-dynamic-purple" />
            Start Focus Session
          </DialogTitle>
          <DialogDescription>
            Set a duration and optional goal. Tuna will cheer you on!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Duration selection */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-dynamic-yellow" />
              Duration
            </Label>
            <RadioGroup
              value={duration.toString()}
              onValueChange={(v) => setDuration(parseInt(v, 10))}
              className="grid grid-cols-3 gap-3"
            >
              {FOCUS_DURATION_PRESETS.map((preset) => (
                <div key={preset.value}>
                  <RadioGroupItem
                    value={preset.value.toString()}
                    id={`duration-${preset.value}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`duration-${preset.value}`}
                    className={cn(
                      'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 p-3 transition-all',
                      'hover:bg-muted/50',
                      'peer-data-[state=checked]:border-dynamic-purple peer-data-[state=checked]:bg-dynamic-purple/10'
                    )}
                  >
                    <span className="font-bold text-lg">{preset.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {preset.description}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Goal input */}
          <div className="space-y-2">
            <Label htmlFor="goal" className="flex items-center gap-2">
              <Target className="h-4 w-4 text-dynamic-blue" />
              What do you want to accomplish? (optional)
            </Label>
            <Input
              id="goal"
              placeholder="e.g., Finish the report, Review code, Study chapter 5..."
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={isLoading}
            className="gap-2 bg-dynamic-purple hover:bg-dynamic-purple/90"
          >
            <Timer className="h-4 w-4" />
            {isLoading ? 'Starting...' : 'Start Focus'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
