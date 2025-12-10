'use client';

import { ArrowLeft, ArrowRight, Loader2, SkipForward } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface NavigationButtonsProps {
  onBack?: () => void;
  onContinue?: () => void;
  onSkip?: () => void;
  backLabel?: string;
  continueLabel?: string;
  skipLabel?: string;
  showBack?: boolean;
  showSkip?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function NavigationButtons({
  onBack,
  onContinue,
  onSkip,
  backLabel = 'Back',
  continueLabel = 'Continue',
  skipLabel = 'Skip',
  showBack = true,
  showSkip = false,
  loading = false,
  disabled = false,
  className,
}: NavigationButtonsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className={cn('flex items-center justify-between gap-4 pt-6', className)}
    >
      <div>
        {showBack && onBack && (
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={loading}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        {showSkip && onSkip && (
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={loading}
            className="gap-2 text-muted-foreground"
          >
            {skipLabel}
            <SkipForward className="h-4 w-4" />
          </Button>
        )}

        {onContinue && (
          <Button
            type="button"
            onClick={onContinue}
            disabled={loading || disabled}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                {continueLabel}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

// Submit button variant for forms
interface SubmitButtonProps {
  label?: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SubmitButton({
  label = 'Continue',
  loadingLabel = 'Saving...',
  loading = false,
  disabled = false,
  className,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={loading || disabled}
      className={cn('gap-2', className)}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="h-4 w-4" />
        </>
      )}
    </Button>
  );
}
