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

interface ThreadMessage {
  id: string;
  from: string;
  date: string;
  subject: string;
  content: string;
  isOriginal?: boolean;
  to?: string[];
  cc?: string[];
}

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
  confidentialMode?: boolean;
}

const DISABLE_MAIL_ACTIONS = true;

// Utility function to parse email threads
function parseEmailThread(content: string): ThreadMessage[] {
  const messages: ThreadMessage[] = [];

  // Clean up content first
  const cleanContent = content.trim();

  // Common patterns for email threading
  const patterns = [
    // Gmail HTML blockquote format with class="gmail_quote"
    {
      regex:
        /<blockquote[^>]*class="gmail_quote"[^>]*>([\s\S]*?)<\/blockquote>/gi,
      isDateFirst: false,
      isHtmlQuote: true,
    },
    // Gmail HTML div format with class="gmail_quote"
    {
      regex: /<div[^>]*class="gmail_quote"[^>]*>([\s\S]*?)<\/div>/gi,
      isDateFirst: false,
      isHtmlQuote: true,
    },
    // Generic HTML blockquote (common in many email clients)
    {
      regex: /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
      isDateFirst: false,
      isHtmlQuote: true,
    },
    // Gmail style: "On [date], [sender] wrote:" (with various date formats)
    {
      regex:
        /On (.+?), (.+?) wrote:\s*\n?([\s\S]*?)(?=\n\s*On .+?, .+? wrote:|$)/g,
      isDateFirst: true,
    },
    // Alternative Gmail format with different date patterns
    {
      regex:
        /On (.+?) at (.+?), (.+?) wrote:\s*\n?([\s\S]*?)(?=\n\s*On .+? at .+?, .+? wrote:|$)/g,
      isDateFirst: true,
      hasTimeInDate: true,
    },
    // More flexible Gmail pattern (handles various date formats)
    {
      regex:
        /On .+?, .+? <[^>]+> wrote:\s*\n?([\s\S]*?)(?=\n\s*On .+?, .+? <[^>]+> wrote:|$)/g,
      isDateFirst: false,
      isFlexibleGmail: true,
    },
    // Outlook style: "From: [sender] Sent: [date]" or similar header blocks
    {
      regex:
        /(?:^|\n)From:\s*(.+?)\s*\n(?:Sent:\s*(.+?)\s*\n)?(?:To:\s*.+?\s*\n)?(?:Subject:\s*.+?\s*\n)?\s*\n([\s\S]*?)(?=\n(?:From:|$))/g,
      isDateFirst: false,
    },
    // Forward style: "---------- Forwarded message ----------"
    {
      regex:
        /----------\s*Forwarded message\s*----------\s*\nFrom:\s*(.+?)\s*\nDate:\s*(.+?)\s*\n(?:Subject:\s*.+?\s*\n)?(?:To:\s*.+?\s*\n)?\s*\n([\s\S]*?)(?=\n----------\s*Forwarded message|$)/g,
      isDateFirst: false,
    },
    // Alternative Gmail quote format with '>' prefixes
    {
      regex: /\n\s*>+\s*On (.+?), (.+?) wrote:\s*\n((?:\s*>.*\n?)*)/g,
      isDateFirst: true,
      isQuoted: true,
    },
    // Simple quoted lines starting with '>' (capture longer blocks)
    {
      regex: /\n((?:\s*>.*\n?){3,})/g, // At least 3 lines of quoted content
      isDateFirst: false,
      isSimpleQuote: true,
    },
  ];

  let remainingContent = cleanContent;
  let messageIndex = 0;
  const foundMatches = [];

  // Try each pattern
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0; // Reset regex
    let match;

    while ((match = pattern.regex.exec(cleanContent)) !== null) {
      const [fullMatch, dateOrFrom, senderOrDate, messageContent] = match;

      if (pattern.isHtmlQuote) {
        // Handle HTML quoted content (Gmail blockquotes, etc.)
        let quotedContent = messageContent || '';

        // Strip HTML tags to get text content
        quotedContent = quotedContent.replace(/<[^>]*>/g, '').trim();

        // Try to extract sender info from common patterns within HTML
        const senderMatch = quotedContent.match(/On .+?, (.+?) wrote:/);
        const dateMatch = quotedContent.match(/On (.+?), .+? wrote:/);

        if (quotedContent) {
          foundMatches.push({
            match: fullMatch,
            message: {
              id: `thread-${messageIndex++}`,
              from: senderMatch?.[1]?.trim() || 'Previous sender',
              date: dateMatch?.[1]?.trim() || '',
              subject: '',
              content: quotedContent,
              isOriginal: false,
            },
          });
        }
      } else if (pattern.isFlexibleGmail) {
        // Handle flexible Gmail format
        const content = messageContent?.trim();
        if (content) {
          foundMatches.push({
            match: fullMatch,
            message: {
              id: `thread-${messageIndex++}`,
              from: 'Previous sender',
              date: '',
              subject: '',
              content,
              isOriginal: false,
            },
          });
        }
      } else if (pattern.isSimpleQuote) {
        // Handle simple quoted lines
        const quotedContent = (messageContent || '')
          .replace(/^\s*>+\s?/gm, '')
          .trim();
        if (quotedContent) {
          foundMatches.push({
            match: fullMatch,
            message: {
              id: `thread-${messageIndex++}`,
              from: 'Previous sender',
              date: '',
              subject: '',
              content: quotedContent,
              isOriginal: false,
            },
          });
        }
      } else if (messageContent && messageContent.trim()) {
        // Handle other patterns
        const isDateFirst = pattern.isDateFirst;
        let from, date;

        if (pattern.hasTimeInDate) {
          // Special handling for "On [date] at [time], [sender] wrote:" format
          from = match[3]; // Third capture group is sender
          date = `${match[1]} at ${match[2]}`; // Combine date and time
        } else {
          from = isDateFirst ? senderOrDate : dateOrFrom;
          date = isDateFirst ? dateOrFrom : senderOrDate;
        }

        let content = messageContent.trim();

        // If this is quoted content, clean up '>' prefixes
        if (pattern.isQuoted) {
          content = content.replace(/^\s*>+\s?/gm, '').trim();
        }

        foundMatches.push({
          match: fullMatch,
          message: {
            id: `thread-${messageIndex++}`,
            from: from?.trim() || 'Unknown',
            date: date?.trim() || '',
            subject: '',
            content,
            isOriginal: false,
          },
        });
      }
    }
  }

  // Sort matches by position in text and add them
  foundMatches.sort(
    (a, b) => cleanContent.indexOf(a.match) - cleanContent.indexOf(b.match)
  );

  // Remove matched content and add messages in reverse order (oldest first in array)
  for (let i = foundMatches.length - 1; i >= 0; i--) {
    const { match, message } = foundMatches[i]!;
    messages.unshift(message); // Add to beginning of array (oldest first)
    remainingContent = remainingContent.replace(match, '').trim();
  }

  // If we found threaded messages, the remaining content is the current/latest message
  if (messages.length > 0 && remainingContent) {
    // Clean up remaining content (remove extra whitespace, empty lines at start/end)
    remainingContent = remainingContent
      .replace(/^\s*\n+/, '')
      .replace(/\n+\s*$/, '')
      .trim();

    if (remainingContent) {
      // Add the latest message at the end of array (will be displayed first)
      messages.push({
        id: `thread-current`,
        from: '', // Will be set from mail data
        date: '', // Will be set from mail data
        subject: '', // Will be set from mail data
        content: remainingContent,
        isOriginal: true,
      });
    }
  } else if (messages.length === 0) {
    // No threading detected, treat entire content as single message
    messages.push({
      id: `thread-single`,
      from: '', // Will be set from mail data
      date: '', // Will be set from mail data
      subject: '', // Will be set from mail data
      content: cleanContent,
      isOriginal: true,
    });
  }

  return messages; // Return in correct order: [oldest, ..., newest]
}

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
    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground text-xs shadow-sm">
      <Avatar className="mr-1 h-5 w-5">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt={name || email} />
        ) : (
          <AvatarFallback className="bg-primary/10 font-bold text-primary text-xs">
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

function ThreadMessageItem({
  message,
  mail,
  membersMap,
  isLast = false,
  confidentialMode = false,
}: {
  message: ThreadMessage;
  mail: InternalEmail;
  membersMap: Record<string, { avatar_url?: string; display_name?: string }>;
  isLast?: boolean;
  confidentialMode?: boolean;
}) {
  const t = useTranslations('mail');

  // Latest message (isOriginal) should always be expanded, older messages collapsed by default
  const [isCollapsed, setIsCollapsed] = useState(!message.isOriginal);

  // Use mail data for original message, parsed data for threaded messages
  const from = message.isOriginal ? mail.source_email : message.from;
  const date = message.isOriginal ? mail.created_at : message.date;
  const parsedFrom = formatEmailAddresses(from)[0];
  const member = membersMap?.[parsedFrom?.email || ''];

  return (
    <div
      className={cn(
        'border-muted/30 border-l-2 px-4 pt-3',
        message.isOriginal && 'border-l-primary/50 bg-primary/5',
        !isLast && 'mb-6',
        'rounded-r-xl'
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shadow-sm ring-1 ring-background">
            {member?.avatar_url ? (
              <AvatarImage
                alt={member.display_name || parsedFrom?.name}
                src={member.avatar_url}
              />
            ) : (
              <AvatarFallback className="bg-primary/10 font-semibold text-primary text-xs">
                {getInitials(parsedFrom?.name || parsedFrom?.email || from)}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground text-sm">
                {confidentialMode
                  ? t('confidential_sender')
                  : parsedFrom?.name || parsedFrom?.email || from}
              </span>
              {message.isOriginal && (
                <span className="rounded bg-primary/20 px-1.5 py-0.5 font-medium text-primary text-xs">
                  Latest
                </span>
              )}
            </div>
            <span className="text-muted-foreground text-xs">
              {confidentialMode
                ? t('confidential_email')
                : parsedFrom?.email &&
                  parsedFrom.name &&
                  `<${parsedFrom.email}>`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <time className="whitespace-nowrap text-muted-foreground text-xs">
            {message.isOriginal
              ? dayjs(date).format('LLLL')
              : date || 'Unknown date'}
          </time>
          {!message.isOriginal && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          isCollapsed ? 'max-h-12' : 'max-h-none'
        )}
      >
        <div className="text-foreground text-sm leading-relaxed">
          {confidentialMode ? (
            <div className="py-4 text-center text-muted-foreground">
              <div className="mb-2 text-2xl opacity-20">🔒</div>
              <p className="font-medium text-sm">{t('confidential_content')}</p>
              <p className="text-xs">{t('confidential_content_desc')}</p>
            </div>
          ) : message.isOriginal && mail.html_payload ? (
            <div
              className="prose prose-sm max-w-full break-words prose-a:text-dynamic-blue prose-blockquote:text-foreground prose-strong:text-foreground text-foreground prose-a:underline"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(message.content),
              }}
            />
          ) : message.content.includes('<') && message.content.includes('>') ? (
            // Handle HTML content in threaded messages
            <div
              className="prose prose-sm max-w-full break-words prose-a:text-dynamic-blue prose-blockquote:text-foreground prose-strong:text-foreground text-foreground prose-a:underline"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(
                  isCollapsed
                    ? `${message.content.slice(0, 150)}${message.content.length > 150 ? '...' : ''}`
                    : message.content
                ),
              }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {isCollapsed
                ? `${message.content.slice(0, 150)}${message.content.length > 150 ? '...' : ''}`
                : message.content}
            </pre>
          )}
          {!confidentialMode && isCollapsed && message.content.length > 150 && (
            <button
              onClick={() => setIsCollapsed(false)}
              className="mt-2 font-medium text-primary text-xs hover:text-primary/80"
            >
              Show more
            </button>
          )}
        </div>
      </div>
    </div>
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
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs opacity-70 shadow-sm">
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
              className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium text-accent-foreground text-xs shadow-sm"
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
  confidentialMode = false,
}: MailDisplayProps) {
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [sanitizedHtml, setSanitizedHtml] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
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

    // In "sent" mode, source_email is always the current user, so reply to the original recipients
    const recipients =
      mail.to_addresses && mail.to_addresses.length > 0
        ? mail.to_addresses
        : [
            formatEmailAddresses(mail.source_email)[0]?.email ||
              mail.source_email,
          ];

    const replySubject = mail.subject.startsWith('Re: ')
      ? mail.subject
      : `Re: ${mail.subject}`;
    const quotedContent = `On ${dayjs(mail.created_at).format('LLLL')}, ${mail.source_email} wrote:\n\n${mail.payload}`;

    onReply({
      to: recipients,
      subject: replySubject,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] }, // Start with empty JSON content for new reply
      quotedContent,
      isReply: true,
    });
  };

  const handleReplyAll = () => {
    if (!mail || !onReplyAll) return;

    // In "sent" mode, include all original recipients plus anyone in CC
    const allRecipients = mail.to_addresses || [];
    const ccRecipients = mail.cc_addresses || [];

    const replySubject = mail.subject.startsWith('Re: ')
      ? mail.subject
      : `Re: ${mail.subject}`;
    const quotedContent = `On ${dayjs(mail.created_at).format('LLLL')}, ${mail.source_email} wrote:\n\n${mail.payload}`;

    // Remove duplicates and filter out current user
    const uniqueToRecipients = [...new Set(allRecipients)].filter(
      (email) => email !== user?.email
    );
    const uniqueCcRecipients = [...new Set(ccRecipients)].filter(
      (email) => email !== user?.email && !uniqueToRecipients.includes(email)
    );

    onReplyAll({
      to: uniqueToRecipients,
      cc: uniqueCcRecipients,
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
    const forwardedContent = `---------- Forwarded message ----------\nFrom: ${mail.source_email}\nDate: ${dayjs(mail.created_at).format('LLLL')}\nSubject: ${mail.subject}\nTo: ${mail.to_addresses?.join(', ') || ''}\n\n${mail.payload}`;

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
        setThreadMessages([]);
        setIsLoading(false);
        return;
      }

      try {
        // Parse email thread first
        const messages = parseEmailThread(mail.payload);

        console.log('Raw mail payload:', mail.payload); // Debug log
        console.log('Parsed thread messages:', messages); // Debug log
        console.log('Thread messages count:', messages.length); // Debug log

        // Update messages with mail data for the original message
        const updatedMessages = messages.map((msg) => {
          if (msg.isOriginal) {
            return {
              ...msg,
              from: mail.source_email,
              date: mail.created_at,
              subject: mail.subject,
              to: mail.to_addresses,
              cc: mail.cc_addresses,
            };
          }
          return msg;
        });

        setThreadMessages(updatedMessages);

        // Sanitize HTML content
        const sanitized = DOMPurify.sanitize(mail.payload);
        setSanitizedHtml(sanitized);
      } catch (error) {
        console.error('Failed to sanitize HTML:', error);
        try {
          // Fallback to sanitize-html if DOMPurify fails
          const sanitizeHtml = (await import('sanitize-html')).default;
          setSanitizedHtml(sanitizeHtml(mail.payload));

          // Still parse threads on fallback
          const messages = parseEmailThread(mail.payload);
          const updatedMessages = messages.map((msg) => {
            if (msg.isOriginal) {
              return {
                ...msg,
                from: mail.source_email,
                date: mail.created_at,
                subject: mail.subject,
                to: mail.to_addresses,
                cc: mail.cc_addresses,
              };
            }
            return msg;
          });
          setThreadMessages(updatedMessages);
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

          // Still parse threads on final fallback
          const messages = parseEmailThread(mail.payload);
          const updatedMessages = messages.map((msg) => {
            if (msg.isOriginal) {
              return {
                ...msg,
                from: mail.source_email,
                date: mail.created_at,
                subject: mail.subject,
                to: mail.to_addresses,
                cc: mail.cc_addresses,
              };
            }
            return msg;
          });
          setThreadMessages(updatedMessages);
        }
      } finally {
        setIsLoading(false);
      }
    };

    setIsLoading(true);
    sanitizeContent();
  }, [
    mail?.payload,
    mail?.source_email,
    mail?.created_at,
    mail?.subject,
    mail?.to_addresses,
    mail?.cc_addresses,
  ]);

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
                    <AvatarFallback className="bg-primary/10 font-semibold text-primary text-sm">
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
                  <h2 className="truncate font-semibold text-base text-foreground leading-tight">
                    {confidentialMode
                      ? t('confidential_subject')
                      : mail.subject}
                  </h2>
                  <p className="truncate font-medium text-foreground/80 text-sm">
                    {confidentialMode
                      ? t('confidential_sender')
                      : formatEmailAddresses(mail.source_email).map(
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
                  : 'max-h-96 pt-3 opacity-100'
              )}
            >
              <div className="flex flex-col items-start gap-1 text-muted-foreground text-xs">
                {confidentialMode ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="min-w-[40px] font-medium text-muted-foreground">
                        {t('from_label').replace(/:/g, '')}:
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs opacity-70 shadow-sm">
                        {t('confidential_sender')}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="min-w-[40px] font-medium text-muted-foreground">
                        {t('to_label').replace(/:/g, '')}:
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs opacity-70 shadow-sm">
                        {t('confidential_recipients')}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
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
            ) : threadMessages.length > 1 ? (
              // Threaded view - multiple messages in conversation
              <div className="space-y-0 p-6">
                <div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
                    {threadMessages.length} messages
                  </span>
                  <span>in this conversation</span>
                </div>
                {threadMessages
                  .slice()
                  .reverse() // Show latest first in display
                  .map((message, index) => (
                    <ThreadMessageItem
                      key={message.id}
                      message={message}
                      mail={mail}
                      membersMap={membersMap}
                      isLast={index === threadMessages.length - 1}
                      confidentialMode={confidentialMode}
                    />
                  ))}
              </div>
            ) : mail.html_payload ? (
              // Single message - HTML content
              <>
                <style>{`.prose a { word-break: break-all; }`}</style>
                <div
                  className="prose max-w-full break-words bg-background prose-a:text-dynamic-blue prose-blockquote:text-foreground prose-strong:text-foreground text-foreground prose-a:underline"
                  style={{ padding: '1.5rem' }}
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: <html content is sanitized>
                  dangerouslySetInnerHTML={{
                    __html: confidentialMode
                      ? `<div class="text-center text-muted-foreground py-8">
                          <div class="text-4xl mb-4 opacity-20">🔒</div>
                          <p class="text-lg font-medium">${t('confidential_content')}</p>
                          <p class="text-sm">${t('confidential_content_desc')}</p>
                        </div>`
                      : sanitizedHtml,
                  }}
                />
              </>
            ) : (
              // Single message - plain text
              <div
                className="bg-background text-foreground text-sm"
                style={{ padding: '1.5rem' }}
                data-testid="mail-plain-content"
              >
                {confidentialMode ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <div className="mb-4 text-4xl opacity-20">🔒</div>
                    <p className="font-medium text-lg">
                      {t('confidential_content')}
                    </p>
                    <p className="text-sm">{t('confidential_content_desc')}</p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap" style={{ margin: 0 }}>
                    {mail.payload}
                  </pre>
                )}
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
