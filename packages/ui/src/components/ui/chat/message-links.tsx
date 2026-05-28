'use client';

import { ExternalLink } from '@tuturuuu/icons';
import type { ChatLinkPreview } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';
import { useChatLinkPreviews } from './hooks';
import { getYouTubeEmbedUrl } from './message-youtube';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/u;

export function extractChatLinks(content: string) {
  return Array.from(content.matchAll(URL_PATTERN), (match) =>
    cleanUrl(match[0])
  ).filter(Boolean);
}

export function MessageText({ content }: { content: string }) {
  const parts = splitTextByLinks(content);

  return (
    <p className="whitespace-pre-wrap break-words">
      {parts.map((part, index) =>
        part.type === 'link' ? (
          <a
            className="font-medium text-dynamic-blue underline-offset-2 hover:underline"
            href={part.value}
            key={`${part.value}-${index}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {part.value}
          </a>
        ) : (
          <span key={`${part.value}-${index}`}>{part.value}</span>
        )
      )}
    </p>
  );
}

export function MessageLinkPreviews({
  content,
  conversationId,
  isOwnMessage,
  wsId,
}: {
  content: string;
  conversationId: string;
  isOwnMessage: boolean;
  wsId: string;
}) {
  const urls = useMemo(() => extractChatLinks(content), [content]);
  const previewsQuery = useChatLinkPreviews({ conversationId, urls, wsId });
  const previews = previewsQuery.data ?? [];
  const previewByUrl = new Map(
    previews.map((preview) => [preview.url, preview])
  );
  const visibleUrls = urls.filter((url) => {
    const preview = previewByUrl.get(url);
    return (
      getYouTubeEmbedUrl(url) ||
      preview?.title ||
      preview?.description ||
      preview?.imageUrl
    );
  });

  const visibleUniqueUrls = Array.from(new Set(visibleUrls));

  if (visibleUniqueUrls.length === 0) return null;

  return (
    <div className="mt-2 grid gap-2">
      {visibleUniqueUrls.map((url) => (
        <LinkPreviewCard
          isOwnMessage={isOwnMessage}
          key={url}
          preview={
            previewByUrl.get(url) ?? {
              description: null,
              imageUrl: null,
              siteName: 'youtube.com',
              title: null,
              url,
            }
          }
        />
      ))}
    </div>
  );
}

function LinkPreviewCard({
  isOwnMessage,
  preview,
}: {
  isOwnMessage: boolean;
  preview: ChatLinkPreview;
}) {
  const youtubeEmbedUrl = getYouTubeEmbedUrl(preview.url);

  if (youtubeEmbedUrl) {
    return (
      <div
        className={cn(
          'grid overflow-hidden rounded-md border bg-background/70 text-left',
          isOwnMessage && 'bg-background/80'
        )}
      >
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="aspect-video w-full border-0"
          src={youtubeEmbedUrl}
          title={preview.title ?? preview.url}
        />
        <a
          className="block transition-colors hover:bg-accent/60"
          href={preview.url}
          rel="noreferrer noopener"
          target="_blank"
        >
          <LinkPreviewMetadata preview={preview} />
        </a>
      </div>
    );
  }

  return (
    <a
      className={cn(
        'grid overflow-hidden rounded-md border bg-background/70 text-left transition-colors hover:bg-accent/60',
        preview.imageUrl ? 'grid-cols-[5.5rem_minmax(0,1fr)]' : 'grid-cols-1',
        isOwnMessage && 'bg-background/80'
      )}
      href={preview.url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {preview.imageUrl ? (
        <span
          aria-hidden="true"
          className="h-full min-h-24 w-full bg-center bg-cover"
          style={{
            backgroundImage: `url(${JSON.stringify(preview.imageUrl)})`,
          }}
        />
      ) : null}
      <LinkPreviewMetadata preview={preview} />
    </a>
  );
}

function LinkPreviewMetadata({ preview }: { preview: ChatLinkPreview }) {
  return (
    <span className="min-w-0 space-y-1 p-3">
      {preview.siteName ? (
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          <ExternalLink className="size-3" />
          <span className="truncate">{preview.siteName}</span>
        </span>
      ) : null}
      {preview.title ? (
        <span className="line-clamp-2 font-medium text-sm">
          {preview.title}
        </span>
      ) : null}
      {preview.description ? (
        <span className="line-clamp-2 text-muted-foreground text-xs">
          {preview.description}
        </span>
      ) : null}
    </span>
  );
}

function splitTextByLinks(content: string) {
  const parts: { type: 'link' | 'text'; value: string }[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const index = match.index ?? 0;
    const clean = cleanUrl(rawUrl);
    const trailing = rawUrl.slice(clean.length);

    if (index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, index) });
    }

    parts.push({ type: 'link', value: clean });
    if (trailing) parts.push({ type: 'text', value: trailing });
    lastIndex = index + rawUrl.length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text' as const, value: content }];
}

function cleanUrl(value: string) {
  return value.replace(TRAILING_PUNCTUATION, '');
}
