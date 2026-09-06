'use client';

import { Loader2, Send } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

interface ChatBoxProps {
  onSubmit: (message: string) => Promise<void>;
  disabled?: boolean;
  connected?: boolean;
}

export function ChatBox({ onSubmit, disabled, connected }: ChatBoxProps) {
  const t = useTranslations('dashboard.voice_assistant.studio');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || !connected || isLoading;

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!input.trim() || isDisabled) return;
        setIsLoading(true);
        setFailed(false);
        try {
          await onSubmit(input.trim());
          setInput('');
          inputRef.current?.focus();
        } catch {
          setFailed(true);
        } finally {
          setIsLoading(false);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={input}
          maxLength={8000}
          onChange={(event) => setInput(event.target.value)}
          aria-label={t('message')}
          placeholder={t('message_placeholder')}
          className="min-w-0 flex-1 rounded-xl bg-background"
          disabled={isDisabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing)
              event.preventDefault();
          }}
        />
        <Button
          type="submit"
          variant="secondary"
          size="icon"
          className="shrink-0 rounded-xl"
          disabled={isDisabled || !input.trim()}
          aria-label={t('send')}
        >
          {isLoading ? (
            <Loader2 className="size-4 motion-safe:animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-destructive text-xs">
          {t('send_failed')}
        </p>
      )}
    </form>
  );
}
