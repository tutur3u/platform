'use client';

import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Mic,
  Sparkles,
  StopCircle,
} from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Textarea } from '@tuturuuu/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ChangeEvent, ReactNode, RefObject } from 'react';
import type { EventAiForm, EventAiFormValues } from './event-ai-form';
import { EventDialogBody, EventDialogFooter } from './event-dialog-frame';
import { SaveShortcutHint } from './event-quick-entry';

export interface EventAiEntryProps {
  form: EventAiForm;
  onGenerate: (values: EventAiFormValues) => void;
  isGenerating: boolean;
  error?: Error;
  isRecording: boolean;
  isProcessingAudio: boolean;
  isProcessingImage: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPickImage: () => void;
  onImageSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onCancel: () => void;
}

/** The AI generate tab: describe the event by text, voice or a photo. */
export function EventAiEntry({
  form,
  onGenerate,
  isGenerating,
  error,
  isRecording,
  isProcessingAudio,
  isProcessingImage,
  onStartRecording,
  onStopRecording,
  onPickImage,
  onImageSelected,
  fileInputRef,
  onCancel,
}: EventAiEntryProps) {
  const t = useTranslations('calendar.event_dialog');
  const capturing = isRecording || isProcessingAudio || isProcessingImage;
  const prompt = form.watch('prompt');

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={form.handleSubmit(onGenerate)}
      >
        <EventDialogBody>
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="prompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('ai_prompt_label')}</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Textarea
                        {...field}
                        autoFocus
                        className="min-h-40 resize-none pb-12"
                        disabled={isGenerating || capturing}
                        placeholder={t('ai_prompt_placeholder')}
                      />
                    </FormControl>
                    <div className="absolute right-2 bottom-2 flex items-center gap-1">
                      <CaptureButton
                        label={isRecording ? t('ai_stop') : t('ai_record')}
                        disabled={
                          isProcessingAudio || isProcessingImage || isGenerating
                        }
                        onClick={
                          isRecording ? onStopRecording : onStartRecording
                        }
                        active={isRecording}
                      >
                        {isRecording ? (
                          <StopCircle />
                        ) : isProcessingAudio ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Mic />
                        )}
                      </CaptureButton>
                      <CaptureButton
                        label={t('ai_image')}
                        disabled={capturing || isGenerating}
                        onClick={onPickImage}
                      >
                        {isProcessingImage ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <ImageIcon />
                        )}
                      </CaptureButton>
                      <input
                        accept="image/*"
                        className="hidden"
                        onChange={onImageSelected}
                        ref={fileInputRef}
                        tabIndex={-1}
                        type="file"
                      />
                    </div>
                  </div>
                  <FormDescription>{t('ai_prompt_hint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isGenerating && (
              <p
                role="status"
                className="flex items-center gap-2 text-muted-foreground text-sm"
              >
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t('ai_generating')}
              </p>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>{t('ai_error_title')}</AlertTitle>
                <AlertDescription>
                  {error.message || t('ai_error_fallback')}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </EventDialogBody>
        <EventDialogFooter>
          <Button
            disabled={isGenerating}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            {t('cancel')}
          </Button>
          <Button disabled={isGenerating || !prompt} type="submit">
            {isGenerating ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            {t('ai_generate')}
            <SaveShortcutHint />
          </Button>
        </EventDialogFooter>
      </form>
    </Form>
  );
}

function CaptureButton({
  label,
  disabled,
  onClick,
  active,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className="size-8"
          disabled={disabled}
          onClick={onClick}
          size="icon"
          type="button"
          variant={active ? 'destructive' : 'ghost'}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
