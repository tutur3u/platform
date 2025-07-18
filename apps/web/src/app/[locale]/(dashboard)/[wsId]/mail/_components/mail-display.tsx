'use client';

import type { InternalEmail } from '@tuturuuu/types/db';
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
import DOMPurify from 'dompurify';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

interface MailDisplayProps {
  mail: InternalEmail | null;
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
      if (!mail?.payload) {
        setSanitizedHtml('');
        setIsLoading(false);
        return;
      }

      try {
        // Dynamically import DOMPurify only on client-side
        const sanitized = DOMPurify.sanitize(mail.payload);
        setSanitizedHtml(sanitized);
      } catch (error) {
        console.error('Failed to sanitize HTML:', error);
        try {
          // Fallback to sanitize-html if DOMPurify fails
          const sanitizeHtml = (await import('sanitize-html')).default;
          setSanitizedHtml(sanitizeHtml(mail.payload));
        } catch (fallbackError) {
          console.error('Failed to sanitize HTML:', fallbackError);
          // If both sanitizers fail, show plain text
          let sanitizedFallback = mail.payload;
          let previous: string;
          do {
            previous = sanitizedFallback;
            sanitizedFallback = sanitizedFallback.replace(/<[^>]*>?/g, '');
          } while (sanitizedFallback !== previous);
          setSanitizedHtml(sanitizedFallback);
        }
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    sanitizeContent();
  }, [mail?.payload]);

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
                  <AvatarImage alt={mail.source_email} />
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
                    {mail.source_email
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
                    {mail.source_email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mail.created_at && (
                  <time className="whitespace-nowrap font-medium text-muted-foreground text-xs">
                    {dayjs(mail.created_at).format('LLLL')}
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
                  <span className="text-foreground/70">
                    {mail.to_addresses}
                  </span>
                </div>
                {mail.to_addresses && mail.to_addresses.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium">{t('to_label')}</span>
                    <span className="text-foreground/70">
                      {mail.to_addresses.join(', ')}
                    </span>
                  </div>
                )}
                {mail.cc_addresses && mail.cc_addresses.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium">CC:</span>
                    <span className="text-foreground/70">
                      {mail.cc_addresses.join(', ')}
                    </span>
                  </div>
                )}
                {mail.bcc_addresses && mail.bcc_addresses.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium">BCC:</span>
                    <span className="text-foreground/70">
                      {mail.bcc_addresses.join(', ')}
                    </span>
                  </div>
                )}
                {mail.reply_to_addresses &&
                  mail.reply_to_addresses.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium">Reply-To:</span>
                      <span className="text-foreground/70">
                        {mail.reply_to_addresses.join(', ')}
                      </span>
                    </div>
                  )}
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : mail.html_payload ? (
              <div
                className="prose max-w-full bg-background text-foreground"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: <html content is sanitized>
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : (
              <pre className="whitespace-pre-wrap bg-background text-foreground text-sm">
                {mail.payload}
              </pre>
            )}
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
