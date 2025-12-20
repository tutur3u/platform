'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Strike from '@tiptap/extension-strike';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { generateHTML } from '@tiptap/html';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChevronDown, ChevronUp, Send, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
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
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import DOMPurify from 'dompurify';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AIEmailDrafter } from './ai-email-drafter';

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
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded border bg-background px-2 py-1">
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
  content: z.any().refine((val) => {
    // Check if it's a valid JSONContent with some meaningful content
    if (!val || !val.content) return false;

    // Helper function to check if a node has text content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasTextContent = (node: any): boolean => {
      if (node.text && node.text.trim().length > 0) return true;
      if (node.content) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return node.content.some((child: any) => hasTextContent(child));
      }
      return false;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return val.content.some((node: any) => hasTextContent(node));
  }, 'Message content is required'),
});

type ComposeFormValues = z.infer<typeof composeSchema>;

interface ComposeDialogProps {
  wsId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    content?: JSONContent;
    quotedContent?: string;
    isReply?: boolean;
  };
}

export function ComposeDialog({
  wsId,
  open,
  onOpenChange,
  initialData,
}: ComposeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations();

  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);

  // User info state
  const [user, setUser] = useState<{
    email: string | undefined;
    display_name: string | null | undefined;
  } | null>(null);
  const [userLoading, setUserLoading] = useState(true);

  // Preview state
  const [previewMode, setPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [sanitizedHtml, setSanitizedHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Quoted content state
  const [showQuotedContent, setShowQuotedContent] = useState(false);
  const [quotedContent, setQuotedContent] = useState('');

  // Fetch user info on mount
  useEffect(() => {
    async function fetchUser() {
      setUserLoading(true);
      try {
        const { createClient } = await import('@tuturuuu/supabase/next/client');
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user?.id) {
          const { data: profile } = await supabase
            .from('users')
            .select('display_name')
            .eq('id', user.id)
            .single();

          setUser({
            email: user.email,
            display_name: profile?.display_name,
          });
        } else {
          setUser(null);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (_) {
        setUser(null);
      } finally {
        setUserLoading(false);
      }
    }
    if (open) fetchUser();
  }, [open]);

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to: initialData?.to || [],
      cc: initialData?.cc || [],
      bcc: initialData?.bcc || [],
      subject: initialData?.subject || '',
      content: initialData?.content || {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      },
    },
  });

  // Reset form when dialog opens with new initial data
  useEffect(() => {
    if (open) {
      form.reset({
        to: initialData?.to || [],
        cc: initialData?.cc || [],
        bcc: initialData?.bcc || [],
        subject: initialData?.subject || '',
        content: initialData?.content || {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        },
      });

      // Handle quoted content for replies
      if (initialData?.quotedContent) {
        setQuotedContent(initialData.quotedContent);
        setShowQuotedContent(false); // Collapsed by default
      } else {
        setQuotedContent('');
        setShowQuotedContent(false);
      }
    }
  }, [open, initialData, form]);

  // Preview sanitization logic
  const contentValue = form.watch('content');
  useEffect(() => {
    if (previewMode !== 'preview') return;
    let cancelled = false;
    async function sanitizeContent() {
      setPreviewLoading(true);
      try {
        // Convert Tiptap JSON to HTML for preview
        const extensions = [
          StarterKit,
          TextAlign,
          Highlight,
          Underline,
          Link.configure({ openOnClick: false }),
          Strike,
          Subscript,
          Superscript,
        ];

        let contentHtml = '';

        // Check if we have valid content to convert
        if (contentValue?.content && Array.isArray(contentValue.content)) {
          try {
            contentHtml = generateHTML(contentValue, extensions);
          } catch (error) {
            console.error('Error generating HTML from Tiptap content:', error);
            contentHtml = '<p>Error generating preview</p>';
          }
        }

        // Combine content with quoted content for preview
        const fullContent = quotedContent
          ? `${contentHtml}\n\n<div class="gmail_quote"><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${quotedContent.replace(/\n/g, '<br>')}</blockquote></div>`
          : contentHtml;

        if (!fullContent.trim()) {
          setSanitizedHtml('');
          setPreviewLoading(false);
          return;
        }

        let sanitized = '';
        try {
          sanitized = DOMPurify.sanitize(fullContent);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
          try {
            const sanitizeHtml = (await import('sanitize-html')).default;
            sanitized = sanitizeHtml(fullContent);
          } catch {
            // fallback: show raw content
            sanitized = fullContent;
          }
        }
        if (!cancelled) setSanitizedHtml(sanitized);
      } catch (error) {
        console.error('Error in preview sanitization:', error);
        if (!cancelled) setSanitizedHtml('<p>Error generating preview</p>');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    sanitizeContent();
    return () => {
      cancelled = true;
    };
  }, [contentValue, previewMode, quotedContent]);

  async function onSubmit(values: ComposeFormValues) {
    setIsLoading(true);
    try {
      // Convert Tiptap JSON to HTML
      const extensions = [
        StarterKit,
        TextAlign,
        Highlight,
        Underline,
        Link.configure({ openOnClick: false }),
        Strike,
        Subscript,
        Superscript,
      ];

      // Generate HTML from the editor content
      const contentHtml = generateHTML(values.content, extensions);

      // Combine user content with quoted content if present
      const finalContent = quotedContent
        ? `${contentHtml}\n\n<div class="gmail_quote"><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${quotedContent.replace(/\n/g, '<br>')}</blockquote></div>`
        : contentHtml;

      const response = await fetch(
        // switch to https://tuturuuu.com endpoint once the mail service PR is merged
        `/api/v1/workspaces/${wsId}/mail/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('apiKey')}`,
          },
          body: JSON.stringify({
            ...values,
            content: finalContent,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      // Reset form and close dialog
      form.reset();
      onOpenChange(false);

      // Refresh the page to show the new sent email
      router.refresh();
    } catch (error: unknown) {
      console.error('Error sending email:', error);
      toast.error(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }

  const toValue = form.watch('to');
  const subjectValue = form.watch('subject');

  const disableSend =
    isLoading ||
    userLoading ||
    !user?.display_name ||
    !subjectValue ||
    subjectValue.trim().length === 0 ||
    !Array.isArray(toValue) ||
    toValue.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            {t('mail.compose_email')}
          </DialogTitle>
        </DialogHeader>

        {/* User info and warning */}
        <div className="mb-2 flex flex-col gap-1">
          {userLoading ? (
            <div className="text-muted-foreground text-xs">
              {t('common.loading')}
            </div>
          ) : user?.display_name && user?.email ? (
            <div className="text-muted-foreground text-xs">
              {t('mail.send_as')}:{' '}
              <span className="font-semibold text-foreground">
                {user.display_name}{' '}
                <span className="opacity-70">&lt;{user.email}&gt;</span>
              </span>
            </div>
          ) : (
            <div className="font-semibold text-destructive text-xs">
              {t('mail.display_name_required', {
                default: t('mail.display_name_required_message'),
              })}
            </div>
          )}
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              {/* AI Email Drafter */}
              <AIEmailDrafter
                onDraftGenerated={(draft) => {
                  form.setValue('subject', draft.subject);
                  form.setValue('content', draft.content);
                  // Force form to re-render and trigger validation
                  form.trigger(['subject', 'content']);
                }}
                disabled={isLoading}
                initialRecipients={form.watch('to')}
                initialContext={
                  initialData?.content ? 'Reply to existing email' : ''
                }
                userEmail={user?.email}
                userDisplayName={user?.display_name || undefined}
              />

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
                              value={field.value ?? []}
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

              {/* Content + Preview Tabs */}
              <Tabs
                value={previewMode}
                onValueChange={(v) => setPreviewMode(v as 'edit' | 'preview')}
                className="w-full"
              >
                <TabsList className="mb-2 w-fit">
                  <TabsTrigger value="edit">{t('mail.edit')}</TabsTrigger>
                  <TabsTrigger value="preview">{t('mail.preview')}</TabsTrigger>
                </TabsList>
                <TabsContent value="edit">
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem className="flex flex-1 flex-col">
                        <FormControl>
                          <RichTextEditor
                            key={JSON.stringify(field.value)}
                            content={
                              field.value &&
                              field.value.type === 'doc' &&
                              field.value.content
                                ? field.value
                                : {
                                    type: 'doc',
                                    content: [
                                      { type: 'paragraph', content: [] },
                                    ],
                                  }
                            }
                            onChange={field.onChange}
                            writePlaceholder={t('mail.message_placeholder')}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div className="min-h-[200px] flex-1 rounded border bg-background p-4">
                    {previewLoading ? (
                      <div className="text-muted-foreground text-xs">
                        {t('common.loading')}
                      </div>
                    ) : sanitizedHtml.trim().length > 0 ? (
                      <div
                        className="prose wrap-break-word max-w-full prose-a:text-dynamic-blue prose-blockquote:text-foreground prose-h1:text-foreground prose-h2:text-foreground prose-h3:text-foreground prose-h4:text-foreground prose-h5:text-foreground prose-h6:text-foreground prose-strong:text-foreground text-foreground prose-a:underline"
                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                      />
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        No content to preview
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Quoted Content Section */}
              {quotedContent && (
                <div className="mt-4">
                  <Collapsible
                    open={showQuotedContent}
                    onOpenChange={setShowQuotedContent}
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex w-full items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5 text-left font-medium text-muted-foreground text-sm transition-all hover:bg-muted/40 hover:text-foreground"
                      >
                        <span className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary/10">
                            <span className="text-xs">💬</span>
                          </div>
                          <span className="text-sm">
                            {initialData?.isReply
                              ? t('mail.original_message')
                              : t('mail.quoted_message')}
                          </span>
                        </span>
                        {showQuotedContent ? (
                          <ChevronUp className="h-4 w-4 transition-transform" />
                        ) : (
                          <ChevronDown className="h-4 w-4 transition-transform" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="rounded-lg border bg-muted/10 p-4">
                        <pre className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
                          {quotedContent}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="mt-2 flex items-center gap-1 text-muted-foreground text-xs">
                    <span className="inline-block h-1 w-1 rounded-full bg-green-500"></span>
                    <span>
                      {initialData?.isReply
                        ? t('mail.original_content_included')
                        : t('mail.quoted_content_included')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={disableSend}
              >
                <X className="mr-2 h-4 w-4" />
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={disableSend}>
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
