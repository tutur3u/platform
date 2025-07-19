'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Send, X } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRef } from 'react';

function EmailChips({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (val: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  function addEmail(email: string) {
    const trimmed = email.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInputValue('');
    }
  }

  function removeEmail(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      if (inputValue.trim()) addEmail(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeEmail(value.length - 1);
    }
  }

  return (
    <div>
      <FormLabel>{label}</FormLabel>
      <div className="flex min-h-[40px] flex-wrap items-center gap-2 rounded border bg-background px-2 py-1">
        {value.map((email) => (
          <span
            key={email}
            className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground text-xs"
          >
            {email}
            <button
              type="button"
              className="ml-1 text-muted-foreground text-xs hover:text-destructive"
              onClick={() => onChange(value.filter((e) => e !== email))}
              disabled={disabled}
              aria-label={`Remove ${email}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addEmail(inputValue);
          }}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={label}
        />
      </div>
    </div>
  );
}

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const addressArraySchema = z
  .array(z.string().min(1))
  .refine(
    (arr) =>
      arr.length > 0 &&
      arr.every((addr) =>
        /^(.*<\s*)?[\w\-.+]+@[\w\-.]+\.[a-zA-Z]{2,}(\s*>)?$/.test(addr)
      ),
    {
      message: 'Please enter valid email addresses',
    }
  );

const composeSchema = z.object({
  to: addressArraySchema,
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().min(1, 'Subject is required'),
  content: z.string().min(1, 'Message content is required'),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComposeDialog({
  wsId,
  open,
  onOpenChange,
}: ComposeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations();

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  const templates = [
    {
      label: 'Blank',
      subject: '',
      content: '',
    },
    {
      label: 'Welcome',
      subject: 'Welcome to Tuturuuu!',
      content:
        'Hi there,\n\nWelcome to Tuturuuu. We are excited to have you on board!',
    },
    {
      label: 'Reset Password',
      subject: 'Reset Your Password',
      content:
        'Hi,\n\nClick the link below to reset your password. If you did not request this, please ignore this email.',
    },
  ];
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]);

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      content: '',
    },
  });

  async function onSubmit(values: ComposeFormValues) {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/mail/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Reset form and close dialog
      form.reset();
      onOpenChange(false);

      // Refresh the page to show the new sent email
      router.refresh();
    } catch (error) {
      console.error('Error sending email:', error);
      // TODO: Add toast notification for error
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-[600px]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t('mail.compose_email')}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {/* Template Selector */}
              <div className="mb-2">
                <label
                  htmlFor="template-select"
                  className="mb-1 block font-medium text-xs"
                >
                  Template
                </label>
                <select
                  id="template-select"
                  className="w-full rounded border bg-background px-2 py-1 text-foreground"
                  value={selectedTemplate?.label ?? ''}
                  onChange={(e) => {
                    const tmpl = templates.find(
                      (t) => t.label === e.target.value
                    );
                    if (tmpl) {
                      setSelectedTemplate(tmpl);
                      form.setValue('subject', tmpl.subject);
                      form.setValue('content', tmpl.content);
                    }
                  }}
                  disabled={isLoading}
                >
                  {templates.map((tmpl) => (
                    <option value={tmpl.label} key={tmpl.label}>
                      {tmpl.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Recipients Row */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <FormField
                      control={form.control}
                      name="to"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <EmailChips
                              label={t('mail.to')}
                              value={field.value}
                              onChange={field.onChange}
                              disabled={isLoading}
                              placeholder={t('mail.recipient_placeholder')}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <button
                    type="button"
                    className="px-1 text-muted-foreground text-xs underline hover:text-foreground"
                    onClick={() => setShowCc((v) => !v)}
                    tabIndex={-1}
                  >
                    {showCc ? 'Hide CC' : 'Show CC'}
                  </button>
                  <button
                    type="button"
                    className="px-1 text-muted-foreground text-xs underline hover:text-foreground"
                    onClick={() => setShowBcc((v) => !v)}
                    tabIndex={-1}
                  >
                    {showBcc ? 'Hide BCC' : 'Show BCC'}
                  </button>
                </div>
                {showCc && (
                  <FormField
                    control={form.control}
                    name="cc"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <EmailChips
                            label="CC"
                            value={field.value ?? []}
                            onChange={field.onChange}
                            disabled={isLoading}
                            placeholder="CC"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {showBcc && (
                  <FormField
                    control={form.control}
                    name="bcc"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <EmailChips
                            label="BCC"
                            value={field.value ?? []}
                            onChange={field.onChange}
                            disabled={isLoading}
                            placeholder="BCC"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Subject */}
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('mail.subject')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('mail.subject_placeholder')}
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Content */}
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem className="flex flex-1 flex-col">
                    <FormLabel>{t('mail.message')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('mail.message_placeholder')}
                        className="min-h-[200px] flex-1 resize-none"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex flex-shrink-0 justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <LoadingIndicator className="mr-2" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {t('mail.send_email')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
