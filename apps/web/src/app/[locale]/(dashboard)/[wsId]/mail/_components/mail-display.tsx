'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Forward,
  Loader2,
  MoreVertical,
  Reply,
  ReplyAll,
  Trash2,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { Mail } from '../client';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

interface MailDisplayProps {
  mail: Mail | null;
}

const DISABLE_MAIL_ACTIONS = true;

export function MailDisplay({ mail }: MailDisplayProps) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [sanitizedHtml, setSanitizedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('mail');
  const locale = useLocale();

  // Set dayjs locale
  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  useEffect(() => {
    const sanitizeContent = async () => {
      if (!mail?.text) {
        setSanitizedHtml('');
        setIsLoading(false);
        return;
      }

      try {
        // Dynamically import DOMPurify only on client-side
        const DOMPurify = (await import('dompurify')).default;
        const sanitized = DOMPurify.sanitize(mail.text);
        setSanitizedHtml(sanitized);
      } catch (error) {
        console.error('Failed to sanitize HTML:', error);
        try {
          // Fallback to sanitize-html if DOMPurify fails
          const sanitizeHtml = (await import('sanitize-html')).default;
          setSanitizedHtml(sanitizeHtml(mail.text));
        } catch (fallbackError) {
          console.error('Failed to sanitize HTML:', fallbackError);
          // If both sanitizers fail, show plain text
          setSanitizedHtml(mail.text.replace(/<[^>]*>?/g, ''));
        }
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    sanitizeContent();
  }, [mail?.text]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-accent/80"
              >
                <Archive className="h-4 w-4" />
                <span className="sr-only">{t('archive')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('archive')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">{t('move_to_trash')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('move_to_trash')}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-accent/80"
              >
                <Reply className="h-4 w-4" />
                <span className="sr-only">{t('reply')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('reply')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-accent/80"
              >
                <ReplyAll className="h-4 w-4" />
                <span className="sr-only">{t('reply_all')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('reply_all')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-accent/80"
              >
                <Forward className="h-4 w-4" />
                <span className="sr-only">{t('forward')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('forward')}</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="mx-2 h-5" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={!mail || DISABLE_MAIL_ACTIONS}
                className="h-8 w-8 hover:bg-accent/80"
              >
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">{t('more')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>{t('mark_as_unread')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mail ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 shadow-sm ring-2 ring-background">
                  <AvatarImage alt={mail.name} />
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
                    {mail.name
                      .split(' ')
                      .map((chunk: string) => chunk[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-0.5">
                  <h2 className="truncate font-semibold text-base text-foreground leading-tight">
                    {mail.subject}
                  </h2>
                  <p className="font-medium text-foreground/80 text-sm">
                    {mail.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mail.date && (
                  <time className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                    {dayjs(mail.date).format('LLLL')}
                  </time>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => setIsHeaderCollapsed(!isHeaderCollapsed)}
                >
                  {isHeaderCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <div
              className={cn(
                'overflow-hidden transition-all duration-300 ease-in-out',
                isHeaderCollapsed
                  ? 'max-h-0 opacity-0'
                  : 'max-h-24 pt-3 opacity-100'
              )}
            >
              <div className="flex flex-col items-start gap-1 text-muted-foreground text-xs">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{t('from_label')}</span>
                  <span className="text-foreground/70">{mail.email}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{t('to_label')}</span>
                  <span className="text-foreground/70">{mail.recipient}</span>
                </div>
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-medium text-sm">
                      {t('loading_email_content')}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-black/90 leading-relaxed [&>*]:text-inherit [&_a:hover]:text-primary/80 [&_a]:text-primary [&_blockquote]:border-border [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:text-muted-black [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-muted-black [&_div]:text-inherit [&_em]:italic [&_h1]:text-black [&_h2]:text-black [&_h3]:text-black [&_h4]:text-black [&_h5]:text-black [&_h6]:text-black [&_li]:ml-4 [&_ol]:list-decimal [&_p]:text-inherit [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-muted-black [&_span]:text-inherit [&_strong]:font-semibold [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML output from DOMPurify
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-full bg-primary/10 p-4">
              <MoreVertical className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-4 font-medium text-foreground text-lg">
              {t('no_email_selected')}
            </p>
            <p className="text-muted-foreground text-sm">
              {t('choose_email_message')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
