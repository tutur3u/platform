'use client';

import { Badge } from './badge';
import { Command, CommandGroup, CommandItem } from './command';
import { Command as CommandPrimitive } from 'cmdk';
import { X } from 'lucide-react';
import * as React from 'react';

interface TagInputProps {
  placeholder?: string;
  tags: string[];
  // eslint-disable-next-line no-unused-vars
  setTags: (tags: string[]) => void;
  suggestions?: string[];
  maxTags?: number;
  disabled?: boolean;
  // eslint-disable-next-line no-unused-vars
  onTagAdd?: (tag: string) => void;
  // eslint-disable-next-line no-unused-vars
  onTagRemove?: (tag: string) => void;
}

export function TagInput({
  placeholder = 'Add tag...',
  tags,
  setTags,
  suggestions = [],
  maxTags,
  disabled = false,
  onTagAdd,
  onTagRemove,
}: TagInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [open, setOpen] = React.useState(false);

  const handleAddTag = (value: string) => {
    const trimmedValue = value.trim();
    if (
      trimmedValue !== '' &&
      !tags.includes(trimmedValue) &&
      (!maxTags || tags.length < maxTags)
    ) {
      const newTags = [...tags, trimmedValue];
      setTags(newTags);
      onTagAdd?.(trimmedValue);
    }
    setInputValue('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const newTags = tags.filter((tag) => tag !== tagToRemove);
    setTags(newTags);
    onTagRemove?.(tagToRemove);
  };

  const filteredSuggestions = suggestions.filter(
    (suggestion) =>
      !tags.includes(suggestion) &&
      suggestion.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <Command className="overflow-visible bg-transparent">
      <div className="border-input ring-offset-background focus-within:ring-ring group rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-offset-2">
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              {!disabled && (
                <button
                  className="ring-offset-background focus:ring-ring ml-1 rounded-full outline-hidden focus:ring-2 focus:ring-offset-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRemoveTag(tag);
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={() => handleRemoveTag(tag)}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            disabled={disabled}
            onValueChange={setInputValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue) {
                handleAddTag(inputValue);
              } else if (
                e.key === 'Backspace' &&
                !inputValue &&
                tags.length > 0
              ) {
                const lastTag = tags[tags.length - 1];
                if (lastTag) {
                  handleRemoveTag(lastTag);
                }
              }
            }}
            onBlur={() => {
              setOpen(false);
              if (inputValue) {
                handleAddTag(inputValue);
              }
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="placeholder:text-muted-foreground flex-1 bg-transparent outline-hidden"
          />
        </div>
      </div>
      <div className="relative mt-2">
        {open && filteredSuggestions.length > 0 && (
          <div className="bg-popover text-popover-foreground animate-in absolute top-0 z-10 w-full rounded-md border shadow-md outline-hidden">
            <CommandGroup className="h-full overflow-auto">
              {filteredSuggestions.map((suggestion) => (
                <CommandItem
                  key={suggestion}
                  onSelect={() => {
                    handleAddTag(suggestion);
                    setOpen(false);
                  }}
                >
                  {suggestion}
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        )}
      </div>
    </Command>
  );
}
