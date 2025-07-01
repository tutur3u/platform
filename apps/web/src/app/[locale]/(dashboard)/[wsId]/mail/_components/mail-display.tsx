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
        // Fallback to plain text if DOMPurify fails
        setSanitizedHtml(mail.text.replace(/<[^>]*>/g, ''));
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    sanitizeContent();
  }, [mail?.text]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between px-4 h-16 border-b bg-background/80 backdrop-blur-sm">
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
        <div className="flex flex-1 flex-col min-h-0">
          <div className="p-4 bg-muted/20 border-b">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                  <AvatarImage alt={mail.name} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                    {mail.name
                      .split(' ')
                      .map((chunk: string) => chunk[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-0.5">
                  <h2 className="font-semibold text-base text-foreground leading-tight truncate">
                    {mail.subject}
                  </h2>
                  <p className="text-sm font-medium text-foreground/80">
                    {mail.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mail.date && (
                  <time className="text-xs text-muted-foreground whitespace-nowrap font-medium">
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
                'transition-all duration-300 ease-in-out overflow-hidden',
                isHeaderCollapsed
                  ? 'max-h-0 opacity-0'
                  : 'max-h-24 opacity-100 pt-3'
              )}
            >
              <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
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

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm font-medium">
                      {t('loading_email_content')}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className="prose prose-sm max-w-none text-black/90 leading-relaxed [&>*]:text-inherit [&_p]:text-inherit [&_div]:text-inherit [&_span]:text-inherit [&_h1]:text-black [&_h2]:text-black [&_h3]:text-black [&_h4]:text-black [&_h5]:text-black [&_h6]:text-black [&_a]:text-primary [&_a:hover]:text-primary/80 [&_strong]:font-semibold [&_em]:italic [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-black [&_code]:bg-muted [&_code]:text-muted-black [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted [&_pre]:text-muted-black [&_pre]:p-4 [&_pre]:rounded-lg [&_table]:border-collapse [&_td]:border [&_th]:border [&_td]:p-2 [&_th]:p-2"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML output from DOMPurify
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              )}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center bg-background">
          <div className="flex flex-col items-center gap-2">
            <div className="p-4 rounded-full bg-primary/10">
              <MoreVertical className="h-8 w-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-foreground mt-4">
              {t('no_email_selected')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('choose_email_message')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
