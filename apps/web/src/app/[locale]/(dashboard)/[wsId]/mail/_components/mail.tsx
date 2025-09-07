'use client';

import { useMail } from '../use-mail';
import { ComposeButton } from './compose-button';
import { ComposeDialog } from './compose-dialog';
import { MailDisplay } from './mail-display';
import { MailList } from './mail-list';
import type {
  InternalEmail,
  User,
  UserPrivateDetails,
} from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { Switch } from '@tuturuuu/ui/switch';
import type { JSONContent } from '@tuturuuu/ui/tiptap';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

interface MailProps {
  mails: InternalEmail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  wsId: string;
  hasCredential: boolean;
  user: (User & UserPrivateDetails) | WorkspaceUser | null;
}

export function MailClient({
  mails,
  defaultLayout = [20, 80],
  onLoadMore,
  hasMore,
  loading,
  wsId,
  hasCredential,
  user,
}: MailProps) {
  const [mail] = useMail();
  const [confidentialMode, setConfidentialMode] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState<
    | {
        to?: string[];
        cc?: string[];
        bcc?: string[];
        subject?: string;
        content?: JSONContent;
        quotedContent?: string;
        isReply?: boolean;
      }
    | undefined
  >(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !onLoadMore || !hasMore || loading)
      return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 200;

    if (isNearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loading]);

  // Reply handlers
  const handleReply = useCallback(
    (mailData: {
      to: string[];
      subject: string;
      content: JSONContent;
      quotedContent: string;
      isReply: boolean;
    }) => {
      setComposeInitialData(mailData);
      setComposeOpen(true);
    },
    []
  );

  const handleReplyAll = useCallback(
    (mailData: {
      to: string[];
      cc: string[];
      subject: string;
      content: JSONContent;
      quotedContent: string;
      isReply: boolean;
    }) => {
      setComposeInitialData(mailData);
      setComposeOpen(true);
    },
    []
  );

  const handleForward = useCallback(
    (mailData: {
      subject: string;
      content: JSONContent;
      quotedContent: string;
      isReply: boolean;
    }) => {
      setComposeInitialData(mailData);
      setComposeOpen(true);
    },
    []
  );

  const openComposeDialog = useCallback(() => {
    setComposeInitialData(undefined);
    setComposeOpen(true);
  }, []);

  const handleComposeOpenChange = useCallback((open: boolean) => {
    setComposeOpen(open);
    // Clear initial data when closing
    if (!open) {
      setComposeInitialData(undefined);
    }
  }, []);

  useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          // biome-ignore lint/suspicious/noDocumentCookie: <>
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
            sizes
          )}`;
        }}
        className="h-full items-stretch"
      >
        <ResizablePanel defaultSize={defaultLayout[0]} minSize={30}>
          <div className="flex h-16 items-center justify-between border-b bg-background/50 px-4 backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <h1 className="font-bold text-xl">{t('mail.sent')}</h1>
              <div className="flex items-center gap-2">
                <Switch
                  id="confidential-mode"
                  checked={confidentialMode}
                  onCheckedChange={setConfidentialMode}
                  className="data-[state=checked]:bg-dynamic-red"
                />
                <label
                  htmlFor="confidential-mode"
                  className="font-medium text-muted-foreground text-xs"
                >
                  {t('confidential_mode')}
                </label>
              </div>
            </div>
            {wsId === ROOT_WORKSPACE_ID && (
              <ComposeButton
                onClick={openComposeDialog}
                disabled={!hasCredential}
              />
            )}
          </div>
          <div
            ref={scrollContainerRef}
            className="h-full w-full overflow-y-auto p-2"
          >
            <MailList
              items={mails}
              hasMore={hasMore}
              loading={loading}
              confidentialMode={confidentialMode}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <MailDisplay
            user={user}
            mail={mails.find((item) => item.id === mail.selected) || null}
            onReply={handleReply}
            onReplyAll={handleReplyAll}
            onForward={handleForward}
            confidentialMode={confidentialMode}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <ComposeDialog
        wsId={wsId}
        open={composeOpen}
        onOpenChange={handleComposeOpenChange}
        initialData={composeInitialData}
      />
    </TooltipProvider>
  );
}
