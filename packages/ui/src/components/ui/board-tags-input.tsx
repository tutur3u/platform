'use client';

import { cn } from '@tuturuuu/utils/format';
import { X } from 'lucide-react';
import React, { type KeyboardEvent, useRef, useState } from 'react';
import { Badge } from './badge';
import { Button } from './button';
import { Input } from './input';

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  disabled?: boolean;
  className?: string;
  tagClassName?: string;
  inputClassName?: string;
  allowDuplicates?: boolean;
  validateTag?: (tag: string) => boolean;
}

export function TagsInput({
  value = [],
  onChange,
  placeholder = 'Add a tag...',
  maxTags,
  disabled = false,
  className,
  tagClassName,
  inputClassName,
  allowDuplicates = false,
  validateTag,
}: TagsInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;

    // Check for duplicates if not allowed
    if (!allowDuplicates && value.includes(trimmedTag)) {
      setInputValue('');
      return;
    }

    // Check max tags limit
    if (maxTags && value.length >= maxTags) {
      setInputValue('');
      return;
    }

    // Validate tag if validator provided
    if (validateTag && !validateTag(trimmedTag)) {
      setInputValue('');
      return;
    }

    onChange([...value, trimmedTag]);
    setInputValue('');
  };

  const removeTag = (indexToRemove: number) => {
    onChange(value.filter((_, index) => index !== indexToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const handleInputBlur = () => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, index) => (
        <Badge
          key={allowDuplicates ? `${tag}-${index}` : tag}
          variant="secondary"
          className={cn('flex items-center gap-1 px-2 py-1', tagClassName)}
        >
          <span>{tag}</span>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeTag(index);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </Badge>
      ))}

      {(!maxTags || value.length < maxTags) && !disabled && (
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleInputBlur}
          placeholder={value.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0',
            inputClassName
          )}
        />
      )}
    </div>
  );
}

// Helper component for predefined tag suggestions
interface TagSuggestionsProps {
  suggestions: string[];
  selectedTags: string[];
  onTagSelect: (tag: string) => void;
  maxDisplay?: number;
}

export function TagSuggestions({
  suggestions,
  selectedTags,
  onTagSelect,
  maxDisplay = 8,
}: TagSuggestionsProps) {
  const availableSuggestions = suggestions.filter(
    (suggestion) => !selectedTags.includes(suggestion)
  );

  if (availableSuggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {availableSuggestions.slice(0, maxDisplay).map((suggestion) => (
        <Button
          key={suggestion}
          type="button"
          variant="outline"
          size="sm"
          className="h-auto px-2 py-1 text-xs"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTagSelect(suggestion);
          }}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
}
