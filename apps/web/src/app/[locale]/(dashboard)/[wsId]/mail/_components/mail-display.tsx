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
import { UserIcon } from '@tuturuuu/ui/icons';
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

function formatDisplayAddresses(
  addresses: string | string[]
): { name: string; email: string; raw: string }[] {
  if (!addresses) return [];
  const arr = Array.isArray(addresses) ? addresses : [addresses];
  return arr
    .filter((addr): addr is string => typeof addr === 'string')
    .map((addr) => {
      const match = addr.match(
        /^(.+?)\s*<\s*([\w\-.+]+@[\w\-.]+\.[a-zA-Z]{2,})\s*>$/
      );
      if (match) {
        return { name: match[1] ?? '', email: match[2] ?? '', raw: addr };
      }
      // If just an email
      if (/^[\w\-.+]+@[\w\-.]+\.[a-zA-Z]{2,}$/.test(addr)) {
        return { name: '', email: addr, raw: addr };
      }
      return { name: '', email: '', raw: addr };
    });
}

function AvatarChip({ name, email }: { name: string; email: string }) {
  const initial = name
    ? name.charAt(0).toUpperCase()
    : email.charAt(0).toUpperCase();
  return (
    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground shadow-sm">
      <span className="mr-1 flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {initial || <UserIcon className="h-4 w-4" />}
      </span>
      <span>{name || email}</span>
      {name && email && (
        <span className="ml-1 text-foreground/80">{`<${email}>`}</span>
      )}
    </span>
  );
}

function AddressChips({
  label,
  addresses,
  avatar,
}: {
  label: string;
  addresses: string[];
  avatar?: boolean;
}) {
  const parsed = formatDisplayAddresses(addresses).filter(
    ({ email }) => !!email
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-[40px] font-medium text-muted-foreground">
        {label.replace(/:/g, '')}:
      </span>
      {parsed.length === 0 ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground opacity-70 shadow-sm">
          None
        </span>
      ) : (
        parsed.map(({ name, email, raw }, idx) => {
          const key = email ? `${email}-${name}` : raw || idx;
          return avatar ? (
            <AvatarChip key={key} name={name} email={email} />
          ) : (
            <span
              key={key}
              className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground shadow-sm"
            >
              {name && <span>{name}</span>}
              <span className="break-words text-foreground/80">{email}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

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
                  <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                    {mail.source_email
                      .split(' ')
                      .map((chunk: string) => chunk[0])
                      .join('')
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="grid gap-0.5">
                  <h2 className="truncate text-base leading-tight font-semibold text-foreground">
                    {mail.subject}
                  </h2>
                  <p className="truncate text-sm font-medium text-foreground/80">
                    {mail.source_email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {mail.created_at && (
                  <time className="text-xs font-medium whitespace-nowrap text-muted-foreground">
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
                  : 'max-h-96 pt-3 opacity-100'
              )}
            >
              <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground">
                <AddressChips
                  label={t('from_label')}
                  addresses={[mail.source_email]}
                  avatar
                />
                {mail.to_addresses && mail.to_addresses.length > 0 && (
                  <AddressChips
                    label={t('to_label')}
                    addresses={mail.to_addresses}
                  />
                )}
                <AddressChips label="CC" addresses={mail.cc_addresses ?? []} />
                <AddressChips
                  label="BCC"
                  addresses={mail.bcc_addresses ?? []}
                />
                {mail.reply_to_addresses &&
                  mail.reply_to_addresses.length > 0 && (
                    <AddressChips
                      label="Reply-To"
                      addresses={mail.reply_to_addresses}
                    />
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
              <>
                <style>{`.prose a { word-break: break-all; }`}</style>
                <div
                  className="prose max-w-full bg-background break-words text-foreground prose-a:text-dynamic-blue prose-a:underline prose-strong:text-foreground"
                  style={{ padding: '1.5rem' }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <html content is sanitized>
                  dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
              </>
            ) : (
              <div
                className="bg-background text-sm text-foreground"
                style={{ padding: '1.5rem' }}
              >
                <pre className="whitespace-pre-wrap" style={{ margin: 0 }}>
                  {mail.payload}
                </pre>
              </div>
            )}
          </ScrollArea>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-background p-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-full bg-primary/10 p-4">
              <MoreVertical className="h-8 w-8 text-primary" />
            </div>
            <p className="mt-4 text-lg font-medium text-foreground">
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
