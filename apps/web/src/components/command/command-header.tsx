'use client';

import { ArrowLeft, Loader, Sparkles } from '@tuturuuu/icons';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { Command as CommandPrimitive } from 'cmdk';

interface CommandHeaderProps {
  page: string;
  inputValue: string;
  setInputValue: (value: string) => void;
  isLoading: boolean;
  isTransitioning: boolean;
  onBack: () => void;
  shouldAutoFocus?: boolean;
}

export function CommandHeader({
  page,
  inputValue,
  setInputValue,
  isLoading,
  isTransitioning,
  onBack,
  shouldAutoFocus = true,
}: CommandHeaderProps) {
  const { modKey } = usePlatform();
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-linear-to-r from-dynamic-blue/5 via-dynamic-purple/5 to-dynamic-pink/5" />
      <div className="relative flex items-center border-dynamic-gray/10 border-b px-4">
        {isLoading ? (
          <div className="mr-3 rounded-lg p-2">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-linear-to-r from-dynamic-blue/20 to-dynamic-purple/20 blur-sm" />
              <Loader className="relative h-4 w-4 animate-spin text-dynamic-blue" />
            </div>
          </div>
        ) : page !== 'root' ? (
          <button
            type="button"
            className="mr-3 rounded-lg p-2 opacity-70 transition-all hover:bg-dynamic-gray/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-dynamic-blue/20 active:scale-95"
            onClick={onBack}
            disabled={isTransitioning}
          >
            <ArrowLeft className="h-4 w-4 text-dynamic-gray" />
          </button>
        ) : (
          <div className="mr-3 rounded-lg bg-linear-to-br from-dynamic-purple/10 to-dynamic-pink/10 p-2">
            <Sparkles className="h-4 w-4 text-dynamic-purple" />
          </div>
        )}
        <CommandPrimitive.Input
          autoFocus={shouldAutoFocus}
          placeholder={
            page === 'add-task'
              ? '✨ What task would you like to create?'
              : page === 'time-tracker'
                ? '⏱️ What are you working on?'
                : '🔍 Search boards, commands...'
          }
          className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          value={inputValue}
          onValueChange={(newValue) => {
            setInputValue(newValue);
          }}
          disabled={isLoading || isTransitioning}
        />
        {page === 'root' && (
          <div className="ml-3 flex items-center gap-2">
            {inputValue && (
              <button
                type="button"
                onClick={() => setInputValue('')}
                className="rounded-md border border-dynamic-gray/20 bg-dynamic-gray/5 px-2 py-1 font-medium text-dynamic-gray text-xs transition-colors hover:bg-dynamic-gray/10"
              >
                Clear
              </button>
            )}
            <div className="rounded-md border border-dynamic-gray/10 bg-linear-to-r from-dynamic-gray/10 to-dynamic-gray/5 px-3 py-1.5 font-medium text-dynamic-gray text-xs">
              {modKey}K
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
