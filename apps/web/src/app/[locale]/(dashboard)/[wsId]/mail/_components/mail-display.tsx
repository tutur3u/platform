'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  InternalEmail,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
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
  UserIcon,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { formatEmailAddresses } from '@tuturuuu/utils/email/client';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
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
  user: (User & UserPrivateDetails) | WorkspaceUser | null;
  onReply?: (mailData: {
    to: string[];
    subject: string;
    content: JSONContent;
    quotedContent: string;
    isReply: boolean;
  }) => void;
  onReplyAll?: (mailData: {
    to: string[];
    cc: string[];
    subject: string;
    content: JSONContent;
    quotedContent: string;
    isReply: boolean;
  }) => void;
  onForward?: (mailData: {
    subject: string;
    content: JSONContent;
    quotedContent: string;
    isReply: boolean;
  }) => void;
}

const DISABLE_MAIL_ACTIONS = true;

function AvatarChip({
  name,
  email,
  avatarUrl,
}: {
  name: string;
  email: string;
  avatarUrl?: string;
}) {
  // Always use only the name part for initials, fallback to email if name is empty
  const initials = getInitials(name || email);
  return (
    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground shadow-sm">
      <Avatar className="mr-1 h-5 w-5">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={name || email} />
        ) : (
          <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
            {initials ||
              (email ? (
                email.charAt(0).toUpperCase()
              ) : (
                <UserIcon className="h-4 w-4" />
              ))}
          </AvatarFallback>
        )}
      </Avatar>
      <span>{name || email}</span>
      {name && email && <span className="ml-1 opacity-50">{`<${email}>`}</span>}
    </span>
  );
}

function AddressChips({
  label,
  addresses,
  avatar,
  membersMap,
}: {
  label: string;
  addresses: string[];
  avatar?: boolean;
  membersMap?: Record<string, { avatar_url?: string; display_name?: string }>;
}) {
  const parsed = formatEmailAddresses(addresses).filter(({ email }) => !!email);
  const t = useTranslations('mail');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="min-w-[40px] font-medium text-muted-foreground">
        {label.replace(/:/g, '')}:
      </span>
      {parsed.length === 0 ? (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground opacity-70 shadow-sm">
          {t('none')}
        </span>
      ) : (
        parsed.map(({ name, email, raw }, idx) => {
          const key = email ? `${email}-${name}` : raw || idx;
          const member = membersMap?.[email ?? ''];
          return avatar ? (
            <AvatarChip
              key={key}
              name={name}
              email={email}
              avatarUrl={member?.avatar_url}
            />
          ) : (
            <span
              key={key}
              className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground shadow-sm"
            >
              {name && <span>{name}</span>}
              <span className="break-words opacity-50">{`<${email}>`}</span>
            </span>
          );
        })
      )}
    </div>
  );
}

export function MailDisplay({
  mail,
  user,
  onReply,
  onReplyAll,
  onForward,
}: MailDisplayProps) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [sanitizedHtml, setSanitizedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const t = useTranslations('mail');
  const locale = useLocale();

  // Fetch workspace members with TanStack Query
  const wsId = mail?.ws_id;
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: async () => {
      if (!wsId) return { members: [] };
      const res = await fetch(`/api/workspaces/${wsId}/members`);
      if (!res.ok) throw new Error('Failed to fetch workspace members');
      return res.json();
    },
    enabled: !!wsId,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });

  // Build membersMap from query data
  const membersMap: Record<
    string,
    { avatar_url?: string; display_name?: string }
  > = (membersData?.members || []).reduce(
    (
      acc: Record<
        string,
        { avatar_url?: string | null; display_name?: string | null }
      >,
      m: WorkspaceUser
    ) => {
      if (m.email)
        acc[m.email] = {
          avatar_url: m.avatar_url,
          display_name: m.display_name,
        };
      return acc;
    },
    {} as Record<
      string,
      { avatar_url?: string | null; display_name?: string | null }
    >
  );

  const sourceMember =
    user?.email &&
    mail?.source_email &&
    formatEmailAddresses(mail?.source_email)?.[0]?.email === user?.email
      ? membersMap[user?.email]
      : null;

  // Set dayjs locale
  useEffect(() => {
    dayjs.locale(locale);
  }, [locale]);

  // Reply handlers
  const handleReply = () => {
    if (!mail || !onReply) return;

    const senderEmail =
      formatEmailAddresses(mail.source_email)[0]?.email || mail.source_email;
    const replySubject = mail.subject.startsWith('Re: ')
      ? mail.subject
      : `Re: ${mail.subject}`;
    const quotedContent = `--- Original Message ---\nFrom: ${mail.source_email}\nDate: ${dayjs(mail.created_at).format('LLLL')}\nSubject: ${mail.subject}\n\n${mail.payload}`;

    onReply({
      to: [senderEmail],
      subject: replySubject,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, // Start with empty JSON content for new reply
      quotedContent,
      isReply: true,
    });
  };

  const handleReplyAll = () => {
    if (!mail || !onReplyAll) return;

    const senderEmail =
      formatEmailAddresses(mail.source_email)[0]?.email || mail.source_email;
    const replySubject = mail.subject.startsWith('Re: ')
      ? mail.subject
      : `Re: ${mail.subject}`;
    const quotedContent = `--- Original Message ---\nFrom: ${mail.source_email}\nDate: ${dayjs(mail.created_at).format('LLLL')}\nSubject: ${mail.subject}\n\n${mail.payload}`;

    // Include all original recipients except the current user
    const allRecipients = [senderEmail];
    if (mail.to_addresses) {
      allRecipients.push(...mail.to_addresses);
    }

    // Remove duplicates and filter out current user
    const uniqueRecipients = [...new Set(allRecipients)].filter(
      (email) => email !== user?.email
    );

    onReplyAll({
      to: uniqueRecipients,
      cc: mail.cc_addresses || [],
      subject: replySubject,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, // Start with empty JSON content for new reply
      quotedContent,
      isReply: true,
    });
  };

  const handleForward = () => {
    if (!mail || !onForward) return;

    const forwardSubject = mail.subject.startsWith('Fwd: ')
      ? mail.subject
      : `Fwd: ${mail.subject}`;
    const forwardedContent = `--- Forwarded Message ---\nFrom: ${mail.source_email}\nDate: ${dayjs(mail.created_at).format('LLLL')}\nSubject: ${mail.subject}\nTo: ${mail.to_addresses?.join(', ') || ''}\n\n${mail.payload}`;

    onForward({
      subject: forwardSubject,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, // Start with empty JSON content for new forward message
      quotedContent: forwardedContent,
      isReply: false, // Forward is not a reply
    });
  };

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
                disabled={!mail || !onReply}
                className="h-8 w-8 hover:bg-accent/80"
                onClick={handleReply}
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
                disabled={!mail || !onReplyAll}
                className="h-8 w-8 hover:bg-accent/80"
                onClick={handleReplyAll}
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
                disabled={!mail || !onForward}
                className="h-8 w-8 hover:bg-accent/80"
                onClick={handleForward}
              >
                <Forward className="h-4 w-4" />
                <span className="sr-only">{t('forward')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('forward')}</TooltipContent>
          </Tooltip>

          {/* <Separator orientation="vertical" className="mx-2 h-5" /> */}

          {/* <DropdownMenu>
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
          </DropdownMenu> */}
        </div>
      </div>

      {mail ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10 shadow-sm ring-2 ring-background">
                  {sourceMember?.avatar_url ? (
                    <AvatarImage
                      alt={sourceMember.display_name}
                      src={sourceMember?.avatar_url}
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                      {(() => {
                        const parsed = formatEmailAddresses(mail.source_email);
                        const name = parsed[0]?.name || '';
                        const email = parsed[0]?.email || mail.source_email;
                        return getInitials(name || email);
                      })()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="grid gap-0.5">
                  <h2 className="truncate text-base leading-tight font-semibold text-foreground">
                    {mail.subject}
                  </h2>
                  <p className="truncate text-sm font-medium text-foreground/80">
                    {formatEmailAddresses(mail.source_email).map(
                      ({ name, email }) => (
                        <span key={email}>
                          {name}{' '}
                          <span className="opacity-50">{`<${email}>`}</span>
                        </span>
                      )
                    )}
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
                  membersMap={membersMap}
                />
                {mail.to_addresses && mail.to_addresses.length > 0 && (
                  <AddressChips
                    label={t('to_label')}
                    addresses={mail.to_addresses}
                    avatar={false}
                    membersMap={membersMap}
                  />
                )}
                <AddressChips
                  label="CC"
                  addresses={mail.cc_addresses ?? []}
                  membersMap={membersMap}
                />
                <AddressChips
                  label="BCC"
                  addresses={mail.bcc_addresses ?? []}
                  membersMap={membersMap}
                />
                {mail.reply_to_addresses &&
                  mail.reply_to_addresses.length > 0 && (
                    <AddressChips
                      label="Reply-To"
                      addresses={mail.reply_to_addresses}
                      membersMap={membersMap}
                    />
                  )}
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? (
              <div
                className="flex h-full items-center justify-center"
                data-testid="loading-indicator"
              >
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
                data-testid="mail-plain-content"
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
