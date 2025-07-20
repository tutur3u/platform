'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Plus, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useBoardTaskTags } from '@/lib/task-helper';

interface TaskTagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  boardId: string;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

export function TaskTagInput({
  value = [],
  onChange,
  boardId,
  placeholder = 'Type to add tags...',
  maxTags = 10,
  disabled = false,
  className,
}: TaskTagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [migrationStatus, setMigrationStatus] = useState<
    'checking' | 'applied' | 'not-applied'
  >('checking');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: boardTags, isLoading, error } = useBoardTaskTags(boardId);

  // Default suggestions for common task tags (just 3 cute ones)
  const defaultSuggestions = ['urgent', 'bug', 'feature'];

  // Check if the tags column exists (migration applied)
  useEffect(() => {
    const checkMigration = async () => {
      try {
        const supabase = createClient();
        // Try to query the tags column to see if it exists
        const { error } = await supabase.from('tasks').select('tags').limit(1);

        if (error?.message.includes('column "tags" does not exist')) {
          setMigrationStatus('not-applied');
          console.warn('Tags migration not applied yet');
        } else {
          setMigrationStatus('applied');
        }
      } catch (err) {
        console.error('Error checking migration status:', err);
        setMigrationStatus('not-applied');
      }
    };

    checkMigration();
  }, []);

  // Update suggestions when board tags change
  useEffect(() => {
    if (boardTags && Array.isArray(boardTags) && boardTags.length > 0) {
      // Use board tags if available
      setSuggestions(boardTags);
    } else {
      // Use default suggestions if no board tags exist yet
      setSuggestions(defaultSuggestions);
    }
  }, [boardTags]);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (!trimmedTag) return;

    // Check for duplicates
    if (value.includes(trimmedTag)) {
      setInputValue('');
      return;
    }

    // Check max tags limit
    if (value.length >= maxTags) {
      setInputValue('');
      return;
    }

    onChange([...value, trimmedTag]);
    setInputValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      const lastTag = value[value.length - 1];
      if (lastTag) {
        removeTag(lastTag);
      }
    }
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    addTag(suggestion);
  };

  const isDisabled = disabled || migrationStatus === 'not-applied';
  const canAddMore = value.length < maxTags;

  // Compute placeholder text to avoid TypeScript issues
  const placeholderText = String(
    value.length === 0 ? (placeholder ?? 'Type to add tags...') : ''
  );

  return (
    <div className={className || ''}>
      {/* Main Tag Input Container */}
      <div
        className={cn(
          'relative min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-all duration-200',
          isFocused && 'ring-2 ring-ring ring-offset-2',
          isDisabled && 'cursor-not-allowed opacity-50',
          value.length === 0 && !isFocused && 'border-dashed'
        )}
      >
        {/* Tags Display */}
        <div className="flex flex-wrap items-center gap-1.5">
          {value.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex h-6 items-center gap-1 px-2 py-1 text-xs"
            >
              <span className="max-w-20 truncate">#{tag}</span>
              {!isDisabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </Badge>
          ))}

          {/* Input Field */}
          {canAddMore && !isDisabled && (
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={handleInputBlur}
              placeholder={placeholderText}
              className="min-w-20 flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
              disabled={isDisabled}
            />
          )}

          {/* Add Button (when input is empty) */}
          {value.length === 0 && !isFocused && !isDisabled && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Plus className="h-3 w-3" />
              <span className="text-xs">Add tags</span>
            </div>
          )}

          {/* Tag Count */}
          {value.length > 0 && (
            <span className="ml-auto text-muted-foreground text-xs">
              {value.length}/{maxTags}
            </span>
          )}
        </div>
      </div>

      {/* Quick Tag Suggestions */}
      {suggestions.length > 0 && value.length === 0 && !isDisabled && (
        <div className="mt-2">
          <p className="mb-1.5 text-muted-foreground text-xs">Quick tags:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSuggestionClick(suggestion)}
                className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 border-dashed bg-gray-50 px-2 py-1 font-medium text-gray-700 text-xs transition-all duration-200 hover:border-gray-400 hover:bg-gray-100"
              >
                #{suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status Messages */}
      {isLoading && (
        <p className="mt-1 text-muted-foreground text-xs">
          Loading tag suggestions...
        </p>
      )}
      {error && (
        <p className="mt-1 text-red-500 text-xs">
          Error loading suggestions: {error.message || 'Unknown error'}
        </p>
      )}
      {migrationStatus === 'not-applied' && (
        <p className="mt-1 text-amber-600 text-xs">
          Tags feature not available yet. Database migration pending.
        </p>
      )}
      {value.length >= maxTags && (
        <p className="mt-1 text-muted-foreground text-xs">
          Maximum {maxTags} tags reached
        </p>
      )}
    </div>
  );
}
