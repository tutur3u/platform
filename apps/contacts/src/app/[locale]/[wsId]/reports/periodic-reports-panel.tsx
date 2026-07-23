'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  XCircle,
} from '@tuturuuu/icons';
import {
  listPeriodicReports,
  type PeriodicReport,
  type PeriodicReportCadence,
  requestPeriodicReportDelivery,
  requestPeriodicReportGeneration,
  updatePeriodicReport,
} from '@tuturuuu/internal-api/reports';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import GroupReportsSelector from '../users/reports/group-reports-selector';

const cadences: PeriodicReportCadence[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
];

type DeliveryAction = 'test' | 'send' | 'retry' | 'cancel';

function statusVariant(status: string) {
  if (status === 'APPROVED' || status === 'sent') return 'success' as const;
  if (status === 'REJECTED' || status === 'failed' || status === 'blocked') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

export default function PeriodicReportsPanel({
  permissions,
  wsId,
}: {
  permissions: {
    canApproveReports: boolean;
    canCheckUserAttendance: boolean;
    canCreateReports: boolean;
    canDeleteReports: boolean;
    canSendReports: boolean;
    canUpdateReports: boolean;
  };
  wsId: string;
}) {
  const t = useTranslations('reports-hub');
  const queryClient = useQueryClient();
  const [cadence, setCadence] = useState<PeriodicReportCadence>('monthly');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [deliveryIntent, setDeliveryIntent] = useState<{
    action: DeliveryAction;
    report: PeriodicReport;
  } | null>(null);
  const [preview, setPreview] = useState<{
    content: string;
    feedback: string;
    recipient: string | null;
    title: string;
  } | null>(null);
  const reportsQuery = useInfiniteQuery({
    initialPageParam: 1,
    queryKey: ['periodic-reports', wsId, cadence, deferredQuery],
    queryFn: ({ pageParam }) =>
      listPeriodicReports(wsId, {
        cadence,
        page: pageParam,
        pageSize: 20,
        query: deferredQuery || undefined,
      }),
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
  });
  const reports = reportsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const counts = reportsQuery.data?.pages[0]?.counts;
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ['periodic-reports', wsId],
    });
  const generationMutation = useMutation({
    mutationFn: (reportId: string) =>
      requestPeriodicReportGeneration(wsId, reportId),
    onSuccess: async () => {
      toast.success(t('generation_ready'));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const approvalMutation = useMutation({
    mutationFn: (reportId: string) =>
      updatePeriodicReport(wsId, reportId, {
        report_approval_status: 'APPROVED',
      }),
    onSuccess: async () => {
      toast.success(t('approved'));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const deliveryMutation = useMutation({
    mutationFn: ({
      action,
      reportId,
    }: {
      action: 'preview' | DeliveryAction;
      reportId: string;
    }) => requestPeriodicReportDelivery(wsId, reportId, action),
    onSuccess: async (result) => {
      toast.success(result.message);
      if (result.preview) setPreview(result.preview);
      setDeliveryIntent(null);
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t('total'), counts?.total ?? 0],
          [t('drafts'), counts?.draft ?? 0],
          [t('pending_review'), counts?.pendingReview ?? 0],
          [t('approved'), counts?.approved ?? 0],
          [t('delivered'), counts?.delivered ?? 0],
          [t('failed'), counts?.failed ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-3 md:p-4">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="mt-1 font-semibold text-xl">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Tabs
          value={cadence}
          onValueChange={(value) => setCadence(value as PeriodicReportCadence)}
        >
          <TabsList className="grid h-auto w-full grid-cols-4">
            {cadences.map((item) => (
              <TabsTrigger key={item} value={item} className="h-full">
                {t(item)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder={t('search_periodic')}
          />
        </div>
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="builder" className="rounded-lg border px-4">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              {t('open_builder')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-2">
            <GroupReportsSelector wsId={wsId} {...permissions} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="space-y-2">
        {reportsQuery.isLoading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : reportsQuery.isError ? (
          <Card>
            <CardContent className="flex min-h-36 flex-col items-center justify-center gap-3 p-4 text-center">
              <p>{t('load_error')}</p>
              <Button
                variant="outline"
                onClick={() => void reportsQuery.refetch()}
              >
                {t('retry')}
              </Button>
            </CardContent>
          </Card>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center">
              <p className="font-medium">{t('no_periodic')}</p>
              <p className="text-muted-foreground text-sm">
                {t('no_periodic_description')}
              </p>
            </CardContent>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{report.title}</p>
                    <Badge
                      variant={statusVariant(report.report_approval_status)}
                    >
                      {report.report_approval_status}
                    </Badge>
                    <Badge variant={statusVariant(report.delivery_status)}>
                      {report.delivery_status}
                    </Badge>
                    {report.generation_mode === 'ai' && (
                      <Badge variant="outline">
                        <Sparkles className="mr-1 h-3 w-3" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-muted-foreground text-sm">
                    {report.user_name ?? t('unknown_member')} ·{' '}
                    {report.group_name ?? t('unknown_group')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {report.period_start && report.period_end
                      ? `${report.period_start} – ${report.period_end}`
                      : t('legacy_unscheduled')}
                  </p>
                  {report.last_delivery_error && (
                    <p className="mt-1 text-destructive text-xs">
                      {report.last_delivery_error}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {report.generation_mode === 'ai' &&
                    report.generation_status !== 'ready' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generationMutation.isPending}
                        onClick={() => generationMutation.mutate(report.id)}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t('generate')}
                      </Button>
                    )}
                  {permissions.canApproveReports &&
                    report.report_approval_status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approvalMutation.isPending}
                        onClick={() => approvalMutation.mutate(report.id)}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        {t('approve')}
                      </Button>
                    )}
                  {permissions.canSendReports && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant={
                            report.report_approval_status === 'APPROVED' &&
                            report.delivery_status !== 'sent'
                              ? 'default'
                              : 'outline'
                          }
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          {t('delivery')}
                          <MoreHorizontal className="ml-2 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            deliveryMutation.mutate({
                              action: 'preview',
                              reportId: report.id,
                            })
                          }
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          {t('preview')}
                        </DropdownMenuItem>
                        {report.report_approval_status === 'APPROVED' && (
                          <>
                            <DropdownMenuItem
                              onSelect={() =>
                                setDeliveryIntent({
                                  action: 'test',
                                  report,
                                })
                              }
                            >
                              <Send className="mr-2 h-4 w-4" />
                              {t('test_send')}
                            </DropdownMenuItem>
                            {report.delivery_status !== 'sent' && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  setDeliveryIntent({
                                    action: 'send',
                                    report,
                                  })
                                }
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                {t('send')}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                        {['failed', 'blocked'].includes(
                          report.delivery_status
                        ) && (
                          <DropdownMenuItem
                            onSelect={() =>
                              setDeliveryIntent({
                                action: 'retry',
                                report,
                              })
                            }
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('retry_delivery')}
                          </DropdownMenuItem>
                        )}
                        {['queued', 'failed'].includes(
                          report.delivery_status
                        ) && (
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setDeliveryIntent({
                                action: 'cancel',
                                report,
                              })
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t('cancel_delivery')}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/${wsId}/users/reports/${report.id}`}>
                      {t('details')}
                      <ChevronDown className="ml-2 h-4 w-4 -rotate-90" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      {reportsQuery.hasNextPage && (
        <Button
          className="w-full"
          variant="outline"
          disabled={reportsQuery.isFetchingNextPage}
          onClick={() => void reportsQuery.fetchNextPage()}
        >
          {reportsQuery.isFetchingNextPage && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t('load_more')}
        </Button>
      )}

      <AlertDialog
        open={Boolean(deliveryIntent)}
        onOpenChange={(open) => !open && setDeliveryIntent(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(`confirm_${deliveryIntent?.action ?? 'send'}_title`)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(`confirm_${deliveryIntent?.action ?? 'send'}_description`, {
                email: deliveryIntent?.report.user_email ?? t('missing_email'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deliveryIntent || deliveryMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deliveryIntent) {
                  deliveryMutation.mutate({
                    action: deliveryIntent.action,
                    reportId: deliveryIntent.report.id,
                  });
                }
              }}
            >
              {deliveryMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t(
                deliveryIntent?.action === 'cancel'
                  ? 'confirm_cancel'
                  : 'confirm_delivery_action'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.title}</DialogTitle>
            <DialogDescription>
              {t('preview_recipient', {
                email: preview?.recipient ?? t('missing_email'),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="rounded-lg border p-4">
              <p className="mb-2 font-medium text-sm">{t('report_content')}</p>
              <p className="whitespace-pre-wrap text-sm">{preview?.content}</p>
            </section>
            {preview?.feedback && (
              <section className="rounded-lg border p-4">
                <p className="mb-2 font-medium text-sm">
                  {t('report_feedback')}
                </p>
                <p className="whitespace-pre-wrap text-sm">
                  {preview.feedback}
                </p>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
