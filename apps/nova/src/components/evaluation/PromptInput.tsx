'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  AlertCircle,
  Clock,
  PlayCircle,
  Plus,
  Target,
  Zap,
} from '@tuturuuu/ui/icons';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';
import { useEffect, useState } from 'react';

interface PromptInputProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string;
  maxLength: number;
  remainingAttempts: number | null;
  currentProgress: any;
}

export function PromptInput({
  prompt,
  onPromptChange,
  onSubmit,
  isSubmitting,
  error,
  maxLength,
  remainingAttempts,
  currentProgress,
}: PromptInputProps) {
  const [characterAnimation, setCharacterAnimation] = useState(false);
  const [submitPulse, setSubmitPulse] = useState(false);

  // Trigger animation when character count changes significantly
  useEffect(() => {
    setCharacterAnimation(true);
    const timer = setTimeout(() => setCharacterAnimation(false), 300);
    return () => clearTimeout(timer);
  }, [Math.floor(prompt.length / 100)]);

  // Trigger submit button pulse on completion
  useEffect(() => {
    if (prompt.trim() && !isSubmitting) {
      setSubmitPulse(true);
      const timer = setTimeout(() => setSubmitPulse(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [prompt.trim().length > 0, isSubmitting]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  };

  const isDisabled =
    remainingAttempts === 0 || isSubmitting || prompt.length > maxLength;

  const characterPercentage = (prompt.length / maxLength) * 100;
  const isNearLimit = characterPercentage > 80;
  const isAtLimit = prompt.length >= maxLength;

  return (
    <div className="flex h-full flex-col">
      {!isSubmitting && (
        <div className="mb-6 rounded-xl border-2 border-foreground/10 bg-gradient-to-r from-background/60 via-background/80 to-background/60 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-foreground/20">
          <div className="flex items-center justify-between text-sm text-foreground/70">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <Target className="h-4 w-4 text-dynamic-blue" />
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'min-w-12 rounded-lg border-2 px-3 py-1 text-center font-mono text-sm font-bold transition-all duration-300',
                      isAtLimit
                        ? 'border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red shadow-dynamic-red/20'
                        : isNearLimit
                          ? 'border-dynamic-amber/40 bg-dynamic-amber/15 text-dynamic-amber shadow-dynamic-amber/20'
                          : 'border-dynamic-blue/40 bg-dynamic-blue/15 text-dynamic-blue shadow-dynamic-blue/20',
                      characterAnimation && 'scale-110'
                    )}
                  >
                    {prompt.length.toLocaleString()}
                  </div>
                  <span className="font-medium">
                    / {maxLength.toLocaleString()} characters
                  </span>
                </div>
              </div>

              {/* Enhanced Character Progress Bar */}
              <div className="flex items-center gap-3">
                <div className="h-2 w-32 overflow-hidden rounded-full border border-foreground/20 bg-background shadow-inner">
                  <div
                    className={cn(
                      'relative h-full overflow-hidden transition-all duration-500 ease-out',
                      isAtLimit
                        ? 'to-dynamic-rose bg-gradient-to-r from-dynamic-red'
                        : isNearLimit
                          ? 'from-dynamic-amber bg-gradient-to-r to-dynamic-orange'
                          : 'bg-gradient-to-r from-dynamic-blue to-dynamic-purple'
                    )}
                    style={{ width: `${Math.min(characterPercentage, 100)}%` }}
                  >
                    {!isAtLimit && (
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    )}
                  </div>
                </div>

                {isNearLimit && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'border text-xs font-medium transition-all duration-300',
                      isAtLimit
                        ? 'animate-pulse border-dynamic-red/40 bg-dynamic-red/15 text-dynamic-red'
                        : 'border-dynamic-amber/40 bg-dynamic-amber/15 text-dynamic-amber'
                    )}
                  >
                    {isAtLimit
                      ? 'Limit reached'
                      : `${Math.round(100 - characterPercentage)}% remaining`}
                  </Badge>
                )}
              </div>
            </div>

            {remainingAttempts !== null && (
              <div className="flex items-center gap-3">
                <Badge
                  variant={remainingAttempts === 0 ? 'destructive' : 'outline'}
                  className={cn(
                    'px-4 py-2 font-medium shadow-sm transition-all duration-300',
                    remainingAttempts === 0
                      ? 'border-dynamic-red/30 bg-dynamic-red/15 text-dynamic-red shadow-dynamic-red/20'
                      : remainingAttempts <= 1
                        ? 'border-dynamic-amber/30 bg-dynamic-amber/15 text-dynamic-amber shadow-dynamic-amber/20'
                        : 'border-dynamic-green/30 bg-dynamic-green/15 text-dynamic-green shadow-dynamic-green/20'
                  )}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {remainingAttempts}{' '}
                  {remainingAttempts === 1 ? 'attempt' : 'attempts'} left
                </Badge>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col pb-4">
        {isSubmitting && currentProgress ? (
          <div className="flex items-center justify-center px-6 py-24">
            <div className="max-w-lg space-y-8 text-center">
              <div className="relative">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/10 via-dynamic-purple/10 to-dynamic-indigo/10 shadow-2xl backdrop-blur-sm">
                  <LoadingIndicator className="h-10 w-10 text-dynamic-blue" />
                </div>
                <div className="absolute inset-0 animate-ping">
                  <div className="mx-auto h-20 w-20 rounded-full border-2 border-dynamic-blue/30 bg-dynamic-blue/10" />
                </div>
                <div className="absolute -top-3 -right-3">
                  <div className="h-8 w-8 animate-bounce text-2xl">✨</div>
                </div>
                <div className="absolute -bottom-2 -left-2">
                  <Zap className="h-6 w-6 animate-pulse text-dynamic-purple" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="bg-gradient-to-r from-dynamic-blue via-dynamic-purple to-dynamic-indigo bg-clip-text text-2xl font-bold text-transparent">
                    {currentProgress.step &&
                    typeof currentProgress.step === 'string'
                      ? currentProgress.step
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, (l: string) => l.toUpperCase())
                      : 'AI Processing'}
                  </h3>
                  <p className="text-lg leading-relaxed text-foreground/80">
                    {currentProgress.message}
                  </p>
                </div>

                <div className="flex justify-center">
                  <Badge
                    variant="outline"
                    className="border-dynamic-blue/30 bg-dynamic-blue/15 px-4 py-2 font-medium text-dynamic-blue shadow-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-dynamic-blue" />
                      {Math.round(currentProgress.progress || 0)}% complete
                    </div>
                  </Badge>
                </div>

                {/* Progress visualization */}
                <div className="mx-auto w-full max-w-xs">
                  <div className="h-2 overflow-hidden rounded-full bg-dynamic-blue/20 shadow-inner">
                    <div
                      className="relative h-full overflow-hidden bg-gradient-to-r from-dynamic-blue via-dynamic-purple to-dynamic-indigo transition-all duration-1000 ease-out"
                      style={{
                        width: `${Math.round(currentProgress.progress || 0)}%`,
                      }}
                    >
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="relative flex-1">
              <Textarea
                value={prompt}
                onChange={(e) => onPromptChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  remainingAttempts === 0
                    ? 'Maximum attempts reached'
                    : 'Write your prompt here...\n\nTip: Press Ctrl+Enter (or Cmd+Enter on Mac) to submit'
                }
                className={cn(
                  'min-h-[200px] flex-1 resize-none border-2 bg-background text-foreground shadow-sm transition-all duration-200',
                  'placeholder:text-foreground/40 focus-visible:ring-transparent',
                  isAtLimit
                    ? 'border-dynamic-red/40 focus-visible:border-dynamic-red/60'
                    : isNearLimit
                      ? 'border-dynamic-amber/40 focus-visible:border-dynamic-amber/60'
                      : 'border-foreground/20 focus-visible:border-dynamic-blue/60',
                  'hover:border-foreground/30'
                )}
                maxLength={maxLength}
                disabled={isDisabled}
              />

              {/* Character limit warning overlay */}
              {prompt.length > maxLength && (
                <div className="absolute right-3 bottom-3 animate-bounce rounded-lg bg-dynamic-red/95 px-3 py-2 text-sm font-medium text-white shadow-xl backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Exceeds limit by{' '}
                    {(prompt.length - maxLength).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-foreground/60">
                <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background/60 px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold">Ctrl</span>
                    <Plus className="h-3 w-3" />
                    <span className="font-mono font-bold">Enter</span>
                  </div>
                  <span>to submit</span>
                </div>
              </div>

              <Button
                onClick={onSubmit}
                disabled={!prompt.trim() || isDisabled}
                className={cn(
                  'gap-3 border-0 px-8 py-3 font-semibold text-white shadow-lg transition-all duration-300',
                  'bg-gradient-to-r from-dynamic-blue to-dynamic-purple',
                  'hover:scale-[1.02] hover:from-dynamic-blue/90 hover:to-dynamic-purple/90 hover:shadow-dynamic-blue/25',
                  'active:scale-[0.98]',
                  'disabled:scale-100 disabled:bg-foreground/20 disabled:text-foreground/40 disabled:shadow-none',
                  submitPulse && !isDisabled && 'animate-pulse'
                )}
              >
                {isSubmitting ? (
                  <>
                    <LoadingIndicator className="h-5 w-5" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-5 w-5" />
                    Submit & Evaluate
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4 shadow-sm">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-dynamic-red" />
            <div>
              <p className="text-sm font-medium text-dynamic-red">Error</p>
              <p className="mt-1 text-sm text-dynamic-red/80">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
