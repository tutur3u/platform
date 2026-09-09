'use client';
import { ArrowUpRight, Globe, Quote } from '@tuturuuu/icons';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  MEET_ASSISTANT_PROFILE,
  MEET_MENTION_MARKER,
  remarkMeetMentions,
} from '../lib/assistant-identity';
import {
  remarkUnresolvedCitations,
  splitChatSources,
  UNRESOLVED_CITATION,
} from '../lib/chat-sources';
import { MiraProfile } from './mira-profile';

const Markdown = dynamic(
  () =>
    import('@tuturuuu/ui/chat/ai-message-markdown').then(
      (m) => m.AssistantMarkdown
    ),
  { ssr: false }
);
const userPlugins = [remarkMeetMentions];
const assistantPlugins = [remarkMeetMentions, remarkUnresolvedCitations];
export function ChatMessageBody({
  body,
  assistant = false,
}: {
  body: string;
  assistant?: boolean;
}) {
  const t = useTranslations('meet.call');
  const { text, sources } = assistant
    ? splitChatSources(body)
    : { text: body, sources: [] };
  return (
    <div className="min-w-0 space-y-3 text-sm leading-relaxed">
      <Markdown
        text={text}
        remarkPlugins={assistant ? assistantPlugins : userPlugins}
        components={{
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-r-lg border-primary/40 border-l-2 bg-muted/40 px-3 py-2 text-muted-foreground">
              <Quote aria-hidden className="mb-1 size-3.5 text-primary" />
              {children}
            </blockquote>
          ),
          a: ({ href, title, children, node, ...props }) => {
            if (
              href === MEET_ASSISTANT_PROFILE &&
              node?.properties.title === MEET_MENTION_MARKER
            )
              return <MiraProfile mention>{children}</MiraProfile>;
            if (assistant && href === UNRESOLVED_CITATION)
              return (
                <span
                  role="note"
                  title={t('citation_unavailable')}
                  aria-label={t('citation_unavailable')}
                  className="mx-0.5 inline-flex size-4 items-center justify-center rounded bg-muted align-super font-medium text-[10px] text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  ?
                </span>
              );
            const citation =
              assistant &&
              /^\d+$/.test(String(children)) &&
              sources.some((source) => source.url === href);
            return (
              <a
                {...props}
                href={href}
                title={title}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  citation
                    ? 'mx-0.5 inline-flex min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 align-super font-semibold text-[11px] text-primary no-underline hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring'
                    : 'text-primary underline decoration-primary/30 underline-offset-3 hover:decoration-primary'
                }
              >
                {children}
              </a>
            );
          },
        }}
      />
      {!!sources.length && (
        <details
          open
          className="rounded-xl border border-border/70 bg-muted/20 p-2.5"
        >
          <summary className="cursor-pointer text-muted-foreground text-xs marker:text-muted-foreground">
            <span className="ml-1 inline-flex items-center gap-1.5 font-medium">
              <Globe aria-hidden className="size-3.5" />
              {t('chat_sources', { count: sources.length })}
            </span>
          </summary>
          <ol className="mt-2 space-y-1">
            {sources.map((source, index) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-background font-medium text-muted-foreground text-xs tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-medium text-xs leading-5">
                    {source.title}
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                  />
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
