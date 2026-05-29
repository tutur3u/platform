'use client';

import {
  ExternalLink,
  FileText,
  ImageIcon,
  Link2,
  LoaderCircle,
} from '@tuturuuu/icons';
import type { ChatAttachment, ChatSharedLink } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '../button';
import { ScrollArea } from '../scroll-area';
import { useChatSharedContent } from './hooks';
import { formatChatTime, formatFileSize } from './utils';

type SharedTab = 'files' | 'links' | 'photos';

export function ChatSharedContentSidebar({
  conversationId,
  onOpenAttachment,
  open,
  wsId,
}: {
  conversationId?: string | null;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
  open: boolean;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const [tab, setTab] = useState<SharedTab>('links');
  const sharedContent = useChatSharedContent({
    conversationId,
    enabled: open,
    wsId,
  });
  const content = sharedContent.data ?? { files: [], links: [], photos: [] };
  const tabs = useMemo(
    () =>
      [
        {
          count: content.links.length,
          id: 'links' as const,
          label: t('links'),
        },
        {
          count: content.files.length,
          id: 'files' as const,
          label: t('files'),
        },
        {
          count: content.photos.length,
          id: 'photos' as const,
          label: t('photos'),
        },
      ] satisfies { count: number; id: SharedTab; label: string }[],
    [content.files.length, content.links.length, content.photos.length, t]
  );

  if (!open) return null;

  return (
    <aside className="hidden w-80 min-w-0 shrink-0 overflow-hidden border-l bg-background md:flex md:flex-col">
      <div className="border-b p-3">
        <h2 className="font-semibold text-sm">{t('shared')}</h2>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-md border bg-muted/30 p-1">
          {tabs.map((item) => (
            <Button
              className={cn(
                'h-8 rounded-sm px-2 text-xs',
                tab === item.id && 'bg-background shadow-xs'
              )}
              key={item.id}
              onClick={() => setTab(item.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {item.label}
              <span className="text-muted-foreground">{item.count}</span>
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {sharedContent.isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('loading_shared_content')}
          </div>
        ) : tab === 'links' ? (
          <SharedLinkList
            emptyLabel={t('no_links_shared')}
            links={content.links}
          />
        ) : tab === 'photos' ? (
          <AttachmentList
            attachments={content.photos}
            emptyLabel={t('no_photos_shared')}
            icon={<ImageIcon className="size-4" />}
            onOpenAttachment={onOpenAttachment}
          />
        ) : (
          <AttachmentList
            attachments={content.files}
            emptyLabel={t('no_files_shared')}
            icon={<FileText className="size-4" />}
            onOpenAttachment={onOpenAttachment}
          />
        )}
      </ScrollArea>
    </aside>
  );
}

function SharedLinkList({
  emptyLabel,
  links,
}: {
  emptyLabel: string;
  links: ChatSharedLink[];
}) {
  if (links.length === 0) {
    return (
      <EmptySharedState
        icon={<Link2 className="size-5" />}
        label={emptyLabel}
      />
    );
  }

  return (
    <div className="max-w-full space-y-1 overflow-hidden p-2">
      {links.map((link) => (
        <a
          className="block min-w-0 max-w-full overflow-hidden rounded-md border bg-muted/20 p-3 transition-colors hover:bg-accent"
          href={link.url}
          key={`${link.messageId}-${link.url}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{link.url}</span>
          </span>
          <span className="mt-1 block text-muted-foreground text-xs">
            {formatChatTime(link.createdAt)}
          </span>
        </a>
      ))}
    </div>
  );
}

function AttachmentList({
  attachments,
  emptyLabel,
  icon,
  onOpenAttachment,
}: {
  attachments: ChatAttachment[];
  emptyLabel: string;
  icon: ReactNode;
  onOpenAttachment?: (attachment: ChatAttachment) => void;
}) {
  if (attachments.length === 0) {
    return <EmptySharedState icon={icon} label={emptyLabel} />;
  }

  return (
    <div className="max-w-full space-y-1 overflow-hidden p-2">
      {attachments.map((attachment) => (
        <button
          className="flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-md border bg-muted/20 p-3 text-left transition-colors hover:bg-accent"
          key={attachment.id}
          onClick={() => onOpenAttachment?.(attachment)}
          type="button"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background">
            {icon}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span
              className="block truncate font-medium text-sm"
              title={attachment.filename}
            >
              {attachment.filename}
            </span>
            <span className="block text-muted-foreground text-xs">
              {formatFileSize(attachment.sizeBytes)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function EmptySharedState({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground text-sm">
      {icon}
      <span>{label}</span>
    </div>
  );
}
