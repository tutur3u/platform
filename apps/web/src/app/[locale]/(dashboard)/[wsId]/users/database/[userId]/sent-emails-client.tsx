'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Loader2, Mail } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Database } from '@tuturuuu/types/supabase';
import { Button } from '@tuturuuu/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Separator } from '@tuturuuu/ui/separator';
import { format, parseISO } from 'date-fns';
import DOMPurify from 'dompurify';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type SentEmail = Database['public']['Tables']['sent_emails']['Row'];

interface SentEmailsClientProps {
  wsId: string;
  userId: string;
  initialEmails: SentEmail[];
  initialCount: number;
  pageSize: number;
}

export default function SentEmailsClient({
  wsId,
  userId,
  initialEmails,
  initialCount,
  pageSize,
}: SentEmailsClientProps) {
  const t = useTranslations('user-data-table');
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const supabase = createClient();

  const sentEmailsQuery = useInfiniteQuery({
    queryKey: ['sent-emails', wsId, userId, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      const start = pageParam * pageSize;
      const end = start + pageSize - 1;

      const { data, error, count } = await supabase
        .from('sent_emails')
        .select('*', { count: 'exact' })
        .eq('ws_id', wsId)
        .eq('receiver_id', userId)
        .order('created_at', { ascending: false })
        .range(start, end);

      if (error) throw error;

      return {
        data: (data || []) as SentEmail[],
        count: count || 0,
        nextCursor: data && data.length === pageSize ? pageParam + 1 : null,
      };
    },
    initialPageParam: 0,
    initialData: {
      pages: [
        {
          data: initialEmails,
          count: initialCount,
          nextCursor: initialEmails.length >= pageSize ? 1 : null,
        },
      ],
      pageParams: [0],
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60 * 1000,
  });

  // Flatten pages
  const allEmails = useMemo(() => {
    return sentEmailsQuery.data?.pages.flatMap((page) => page.data) || [];
  }, [sentEmailsQuery.data]);

  const totalCount = sentEmailsQuery.data?.pages[0]?.count || initialCount;

  const handleViewEmail = (email: SentEmail) => {
    setSelectedEmail(email);
    setIsViewDialogOpen(true);
  };

  const handleLoadMore = () => {
    if (!sentEmailsQuery.isFetchingNextPage && sentEmailsQuery.hasNextPage) {
      sentEmailsQuery.fetchNextPage();
    }
  };

  const sanitizedContent = useMemo(() => {
    return DOMPurify.sanitize(selectedEmail?.content || '');
  }, [selectedEmail]);

  return (
    <>
      <div className="flex flex-col rounded-lg border border-border bg-foreground/5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold text-xl">
            {t('sent_emails_title') || 'Sent Emails'}
            {totalCount > 0 && ` (${totalCount})`}
          </div>
        </div>

        <Separator className="mb-4" />

        {sentEmailsQuery.isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-muted-foreground" />
            <div className="text-muted-foreground">
              {t('loading') || 'Loading...'}
            </div>
          </div>
        ) : sentEmailsQuery.isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 font-medium text-destructive">
              {t('error_loading_emails') || 'Failed to load emails'}
            </div>
            <div className='mb-4 text-muted-foreground text-sm'>
              {t('error_loading_emails_description') ||
                'There was an error loading the sent emails. Please try again.'}
            </div>
            <Button
              variant="outline"
              onClick={() => sentEmailsQuery.refetch()}
              disabled={sentEmailsQuery.isRefetching}
            >
              {sentEmailsQuery.isRefetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('loading') || 'Loading...'}
                </>
              ) : (
                t('retry') || 'Retry'
              )}
            </Button>
          </div>
        ) : allEmails.length > 0 ? (
          <>
            <div className='max-h-96 space-y-2 overflow-y-auto pr-2'>
              {allEmails.map((email) => (
                <button
                  key={email.id}
                  type="button"
                  className='group flex w-full cursor-pointer items-start rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-lg'
                  onClick={() => handleViewEmail(email)}
                >
                  <div className="flex w-full items-start space-x-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dynamic-blue/10">
                      <Mail className="h-5 w-5 text-dynamic-blue" />
                    </div>
                    <div className="flex-1 text-left">
                      <div className="mb-1">
                        <div className="font-semibold text-foreground">
                          {email.subject}
                        </div>
                      </div>
                      <div className='mb-1 text-muted-foreground text-sm'>
                        <span className="opacity-60">
                          {t('from') || 'From'}:
                        </span>{' '}
                        {email.source_name}{' '}
                        <span className="opacity-60">
                          {'<'}
                          {email.source_email}
                          {'>'}
                        </span>
                      </div>
                      <div className='text-muted-foreground text-sm'>
                        <span className="opacity-60">{t('to') || 'To'}:</span>{' '}
                        {email.email}
                      </div>
                      <div className='mt-2 text-muted-foreground text-xs opacity-60'>
                        {format(
                          parseISO(email.created_at),
                          'dd/MM/yyyy, HH:mm:ss'
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {sentEmailsQuery.hasNextPage && (
              <div className='flex justify-center border-t pt-4'>
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={sentEmailsQuery.isFetchingNextPage}
                >
                  {sentEmailsQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('loading_more') || 'Loading more...'}
                    </>
                  ) : (
                    t('load_more') || 'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
            <div className="font-medium text-muted-foreground">
              {t('no_sent_emails') || 'No sent emails'}
            </div>
            <div className='text-muted-foreground text-sm'>
              {t('no_sent_emails_description') ||
                'This user has not received any emails yet.'}
            </div>
          </div>
        )}
      </div>

      {/* View Email Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className='!w-[98vw] sm:!max-w-[98vw] lg:!max-w-[1600px] !h-[95vh] !max-h-[95vh] gap-0 overflow-hidden p-0'>
          <div className="flex h-full flex-col overflow-hidden">
            {/* Header with metadata */}
            <div className='shrink-0 border-b px-8 py-6'>
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {selectedEmail?.subject}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="mt-4 grid grid-cols-1 gap-4 text-sm lg:grid-cols-3">
                    <div className="flex items-center gap-2">
                      <span className='shrink-0 font-medium opacity-60'>
                        {t('from') || 'From'}:
                      </span>
                      <span className="truncate">
                        {selectedEmail?.source_name}{' '}
                        <span className="opacity-60">
                          {'<'}
                          {selectedEmail?.source_email}
                          {'>'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className='shrink-0 font-medium opacity-60'>
                        {t('to') || 'To'}:
                      </span>
                      <span className="truncate">{selectedEmail?.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className='shrink-0 font-medium opacity-60'>
                        {t('sent_at') || 'Sent'}:
                      </span>
                      <span>
                        {selectedEmail?.created_at
                          ? format(
                              parseISO(selectedEmail.created_at),
                              'dd/MM/yyyy, HH:mm:ss'
                            )
                          : '-'}
                      </span>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Email content - scrollable with centered max-width container */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: sanitizedContent,
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
