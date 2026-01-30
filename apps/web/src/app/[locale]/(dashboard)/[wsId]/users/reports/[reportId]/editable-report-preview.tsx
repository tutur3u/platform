'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileText,
  History,
  ImageIcon,
  Loader2,
  Moon,
  Palette,
  PencilIcon,
  Plus,
  Printer,
  Shield as ShieldIcon,
  Sun,
  Undo,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUserReport } from '@tuturuuu/types';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import ReportPreview from '@tuturuuu/ui/custom/report-preview';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { useLatestApprovedLog } from '../../approvals/hooks/use-approvals';
import UserMonthAttendance from '../../attendance/user-month-attendance';
import UserReportForm from './form';
import ScoreDisplay from './score-display';

export const UserReportFormSchema = z.object({
  title: z.string(),
  content: z.string(),
  feedback: z.string(),
});

export default function EditableReportPreview({
  wsId,
  report,
  configs,
  isNew,
  groupId,
  healthcareVitals = [],
  healthcareVitalsLoading = false,
  factorEnabled = false,
  managerOptions,
  selectedManagerName,
  onChangeManagerAction,
  canCheckUserAttendance,
  canUpdateReports = false,
  canDeleteReports = false,
}: {
  wsId: string;
  report: Partial<WorkspaceUserReport> & {
    user_name?: string;
    user_archived?: boolean;
    user_archived_until?: string | null;
    user_note?: string | null;
    creator_name?: string;
    group_name?: string;
    report_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  };
  configs: WorkspaceConfig[];
  isNew: boolean;
  groupId?: string;
  healthcareVitals?: Array<{
    id: string;
    name: string;
    unit: string;
    factor: number;
    value: number | null;
  }>;
  healthcareVitalsLoading?: boolean;
  factorEnabled?: boolean;
  managerOptions?: Array<{ value: string; label: string }>;
  selectedManagerName?: string;
  onChangeManagerAction?: (name?: string) => void;
  canCheckUserAttendance?: boolean;
  canUpdateReports?: boolean;
  canDeleteReports?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Fetch latest approved log if report is rejected
  const isRejected = report.report_approval_status === 'REJECTED';
  const { data: latestApprovedLog, isLoading: isLoadingApprovedLog } =
    useLatestApprovedLog(isRejected ? report.id || null : null);

  // Show loading state while fetching approved log for rejected reports
  const isLoadingRejectedBase = isRejected && isLoadingApprovedLog;

  // Determine form values: use latest approved log if rejected, otherwise use report
  const getFormValues = () => {
    if (isRejected && latestApprovedLog) {
      return {
        title: latestApprovedLog.title || '',
        content: latestApprovedLog.content || '',
        feedback: latestApprovedLog.feedback || '',
      };
    }
    return {
      title: report?.title || '',
      content: report?.content || '',
      feedback: report?.feedback || '',
    };
  };

  const form = useForm({
    resolver: zodResolver(UserReportFormSchema),
    defaultValues: getFormValues(),
  });

  // Ensure form reflects the latest report when switching user/report selections
  // If rejected, use the latest approved log as the base state
  useEffect(() => {
    const formValues =
      isRejected && latestApprovedLog
        ? {
            title: latestApprovedLog.title || '',
            content: latestApprovedLog.content || '',
            feedback: latestApprovedLog.feedback || '',
          }
        : {
            title: report?.title || '',
            content: report?.content || '',
            feedback: report?.feedback || '',
          };
    form.reset(formValues);
  }, [isRejected, latestApprovedLog, report, form.reset]);

  const title = form.watch('title');
  const content = form.watch('content');
  const feedback = form.watch('feedback');

  const getConfig = (id: string) => configs.find((c) => c.id === id)?.value;

  const parseDynamicText = (text?: string | null): ReactNode => {
    if (!text) return '';

    // Split the text into segments of dynamic keys and plain text
    const segments = text.split(/({{.*?}})/g).filter(Boolean);

    // Map over the segments, converting dynamic keys into <span> elements
    const parsedText = segments.map((segment, index) => {
      const match = segment.match(/{{(.*?)}}/);
      if (match) {
        const key = match?.[1]?.trim() || '';

        if (key === 'user_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.user_name || '...'}
            </span>
          );
        }

        if (key === 'group_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.group_name || '...'}
            </span>
          );
        }

        if (key === 'group_manager_name') {
          return (
            <span key={key + index} className="font-semibold">
              {report.creator_name || '...'}
            </span>
          );
        }

        return (
          <span
            key={key + index}
            className="rounded bg-foreground px-1 py-0.5 font-semibold text-background"
          >
            {key}
          </span>
        );
      }
      return segment;
    });

    return parsedText;
  };

  // Logs timeline
  const logsQuery = useQuery({
    queryKey: ['ws', wsId, 'report', report?.id, 'logs'],
    enabled: Boolean(report?.id) && !isNew,
    queryFn: async (): Promise<
      Array<{
        id: string;
        created_at: string;
        creator_name?: string | null;
        title?: string | null;
        content?: string | null;
        feedback?: string | null;
        score?: number | null;
        scores?: number[] | null;
      }>
    > => {
      const { data, error } = await supabase
        .from('external_user_monthly_report_logs')
        .select(
          'id, created_at, title, content, feedback, score, scores, creator:workspace_users!creator_id(full_name, display_name)'
        )
        .eq('report_id', report?.id as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => ({
        id: raw.id,
        created_at: raw.created_at,
        creator_name: raw.creator?.display_name
          ? raw.creator.display_name
          : raw.creator?.full_name,
        title: raw.title,
        content: raw.content,
        feedback: raw.feedback,
        score: raw.score,
        scores: raw.scores as number[] | null,
      })) as Array<{
        id: string;
        created_at: string;
        creator_name?: string | null;
        title?: string | null;
        content?: string | null;
        feedback?: string | null;
        score?: number | null;
        scores?: number[] | null;
      }>;
    },
  });

  const formatRelativeTime = (dateIso?: string) => {
    if (!dateIso) return '';
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const now = new Date();
    const then = new Date(dateIso);
    const diffMs = then.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const minutes = Math.round(absMs / (60 * 1000));
    if (minutes < 60)
      return rtf.format(Math.sign(diffMs) * Math.round(minutes), 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24)
      return rtf.format(Math.sign(diffMs) * Math.round(hours), 'hour');
    const days = Math.round(hours / 24);
    if (days < 30)
      return rtf.format(Math.sign(diffMs) * Math.round(days), 'day');
    const months = Math.round(days / 30);
    if (months < 12)
      return rtf.format(Math.sign(diffMs) * Math.round(months), 'month');
    const years = Math.round(months / 12);
    return rtf.format(Math.sign(diffMs) * Math.round(years), 'year');
  };

  // Mutations: create, update, delete
  const createMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      feedback: string;
    }) => {
      if (!report.user_id || !report.group_id)
        throw new Error('Missing user or group');

      // Get the current user's workspace user ID
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('User not authenticated');

      const { data: workspaceUser, error: workspaceUserError } = await supabase
        .from('workspace_user_linked_users')
        .select('virtual_user_id')
        .eq('platform_user_id', authUser.id)
        .eq('ws_id', wsId)
        .single();

      if (workspaceUserError) throw workspaceUserError;
      if (!workspaceUser) throw new Error('User not found in workspace');

      // Calculate scores and average from healthcare vitals if not already calculated
      let calculatedScores = report.scores;
      let calculatedScore = report.score;

      if (isNew && healthcareVitals.length > 0) {
        const scores = healthcareVitals
          .filter((vital) => vital.value !== null && vital.value !== undefined)
          .map((vital) => {
            const baseValue = vital.value ?? 0;
            // Apply factor only if feature flag is enabled
            return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
          });

        calculatedScores = scores.length > 0 ? scores : [];
        calculatedScore =
          scores.length > 0
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : null;
      }

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('external_user_monthly_reports')
        .insert({
          user_id: report.user_id,
          group_id: report.group_id,
          title: payload.title,
          content: payload.content,
          feedback: payload.feedback,
          score: calculatedScore,
          scores: calculatedScores,
          creator_id: workspaceUser.virtual_user_id ?? undefined,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: async (data) => {
      toast.success(t('ws-reports.report_created'));
      // Invalidate lists that may include this report
      if (report.user_id && report.group_id) {
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        });
      }
      // Navigate depending on context
      const isGroupContext = pathname.includes('/users/groups/');
      if (isGroupContext) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.set('reportId', data.id);
        router.replace(`${pathname}?${sp.toString()}`);
      } else {
        router.replace(`/${wsId}/users/reports/${data.id}`);
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_create_report')
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      title: string;
      content: string;
      feedback: string;
    }) => {
      if (!report.id) throw new Error('Missing report id');
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .update({
          title: payload.title,
          content: payload.content,
          feedback: payload.feedback,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_saved'));
      // Invalidate detail and logs
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'report', report.id, 'logs'],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'report',
            report.id,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        }),
      ]);
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t('ws-reports.failed_save_report')
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!report.id) throw new Error('Missing report id');
      const { error } = await supabase
        .from('external_user_monthly_reports')
        .delete()
        .eq('id', report.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(t('ws-reports.report_deleted'));
      if (report.user_id && report.group_id) {
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'reports',
          ],
        });
      }
      const isGroupContext = pathname.includes('/users/groups/');
      if (isGroupContext) {
        const sp = new URLSearchParams(searchParams.toString());
        sp.delete('reportId');
        router.replace(`${pathname}?${sp.toString()}`);
      } else {
        // Redirect to new with preserved user/group if available
        const qp: string[] = [];
        if (report.group_id)
          qp.push(`groupId=${encodeURIComponent(report.group_id)}`);
        if (report.user_id)
          qp.push(`userId=${encodeURIComponent(report.user_id)}`);
        const qs = qp.length ? `?${qp.join('&')}` : '';
        router.replace(`/${wsId}/users/reports/new${qs}`);
      }
    },
    onError: (err) => {
      toast.error(err?.message || t('ws-reports.failed_delete_report'));
    },
  });

  // Mutation to update report with new scores from healthcare vitals
  const updateScoresMutation = useMutation({
    mutationFn: async () => {
      if (!report.id || !report.user_id || !report.group_id) {
        throw new Error('Missing report, user, or group information');
      }

      // Fetch fresh healthcare vitals data
      const { data: vitalsData, error: vitalsError } = await supabase
        .from('user_indicators')
        .select(`
          value,
          healthcare_vitals!inner(
            id,
            name,
            unit,
            factor,
            group_id
          )
        `)
        .eq('user_id', report.user_id)
        .eq('healthcare_vitals.group_id', report.group_id);

      if (vitalsError) throw vitalsError;

      const vitals = (vitalsData ?? []).map((item) => ({
        id: item.healthcare_vitals.id,
        name: item.healthcare_vitals.name,
        unit: item.healthcare_vitals.unit,
        factor: item.healthcare_vitals.factor,
        value: item.value,
      }));

      // Calculate new scores
      const scores = vitals
        .filter((vital) => vital.value !== null && vital.value !== undefined)
        .map((vital) => {
          const baseValue = vital.value ?? 0;
          // Apply factor only if feature flag is enabled
          return factorEnabled ? baseValue * (vital.factor ?? 1) : baseValue;
        });

      const averageScore =
        scores.length > 0
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : null;

      // Update the report with new scores
      const { error: updateError } = await supabase
        .from('external_user_monthly_reports')
        .update({
          scores: scores.length > 0 ? scores : null,
          score: averageScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);

      if (updateError) throw updateError;

      return { scores, averageScore, vitals };
    },
    onSuccess: async (_data) => {
      toast.success(t('ws-reports.scores_updated'));

      // Update the local report state
      if (report.id) {
        // Invalidate and refetch the report detail query
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'report',
            report.id,
          ],
        });

        // Also invalidate the healthcare vitals query to get fresh data
        await queryClient.invalidateQueries({
          queryKey: [
            'ws',
            wsId,
            'group',
            report.group_id,
            'user',
            report.user_id,
            'healthcare-vitals',
          ],
        });
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof Error
          ? err.message
          : t('ws-reports.failed_update_scores')
      );
    },
  });

  const [selectedLog, setSelectedLog] = useState<{
    id: string;
    title?: string | null;
    content?: string | null;
    feedback?: string | null;
    score?: number | null;
    scores?: number[] | null;
  } | null>(null);

  // Local theme toggle for report preview only
  const [isDarkPreview, setIsDarkPreview] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const isPendingApproval = report.report_approval_status === 'PENDING';
  const previewTitle = selectedLog?.title ?? title;
  const previewContent = selectedLog?.content ?? content;
  const previewFeedback = selectedLog?.feedback ?? feedback;
  const previewScore = (selectedLog?.score ?? report.score)?.toFixed(1) || '';

  const handlePrintExport = () => {
    const printableArea = document.getElementById('printable-area');
    if (!printableArea) {
      toast.error(t('ws-reports.report_export_not_found'));
      return;
    }

    // Get all stylesheets from the current document
    const stylesheets = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          if (styleSheet.href) {
            return `<link rel="stylesheet" href="${styleSheet.href}">`;
          } else if (styleSheet.ownerNode) {
            // For inline styles
            const styleElement = styleSheet.ownerNode as HTMLStyleElement;
            return `<style>${styleElement.innerHTML}</style>`;
          }
        } catch (_e) {
          // Handle CORS issues with external stylesheets
          if (styleSheet.href) {
            return `<link rel="stylesheet" href="${styleSheet.href}">`;
          }
        }
        return '';
      })
      .join('\n');

    // Create the HTML content for printing
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${t('ws-reports.report')} - ${previewTitle || t('common.untitled')}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          ${stylesheets}
                    <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: white;
              color: black;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              #printable-area {
                height: auto !important;
                width: auto !important;
                max-width: none !important;
                border: none !important;
                border-radius: 0 !important;
                box-shadow: none !important;
                margin: 0 !important;
                background: white !important;
              }
              .print\\:hidden {
                display: none !important;
              }
              .print\\:text-black {
                color: black !important;
              }
              .print\\:bg-white {
                background-color: white !important;
              }
              .print\\:border-black {
                border-color: black !important;
              }
              .print\\:text-red-600 {
                color: #dc2626 !important;
              }
              .print\\:border-0 {
                border: none !important;
              }
              .print\\:rounded-none {
                border-radius: 0 !important;
              }
              .print\\:h-auto {
                height: auto !important;
              }
              .print\\:p-8 {
                padding: 2rem !important;
              }
              .print\\:w-auto {
                width: auto !important;
              }
              .print\\:max-w-none {
                max-width: none !important;
              }
              .print\\:shadow-none {
                box-shadow: none !important;
              }
              .print\\:m-0 {
                margin: 0 !important;
              }
              .print\\:p-4 {
                padding: 1rem !important;
              }
              .print\\:opacity-50 {
                opacity: 0.5 !important;
              }
            }
          </style>
        </head>
        <body>
          ${printableArea.outerHTML}
          <script>
            window.onload = function() {
              // Small delay to ensure styles are loaded
              setTimeout(() => {
                window.print();
                // Close the window after printing (optional)
                window.onafterprint = function() {
                  window.close();
                };
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    // Create a blob with the HTML content
    const blob = new Blob([printContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open the blob URL in a new tab
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (printWindow) {
      // Clean up the blob URL when the tab is closing
      const revoke = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_) {
          // no-op
        }
      };
      printWindow.addEventListener('beforeunload', revoke, { once: true });
      // Fallback cleanup in case beforeunload doesn't fire
      setTimeout(revoke, 60_000);
    } else {
      // Clean up if window couldn't be opened
      URL.revokeObjectURL(url);
    }
  };

  const handlePngExport = async () => {
    setIsExporting(true);
    try {
      // Dynamically import html2canvas-pro to avoid SSR issues
      const html2canvas = (await import('html2canvas-pro')).default;

      const printableArea = document.getElementById('printable-area');
      if (!printableArea) {
        throw new Error(t('ws-reports.report_export_not_found'));
      }

      // Create canvas with high quality settings
      const canvas = await html2canvas(printableArea, {
        scale: 2, // Higher resolution
        useCORS: true,
        allowTaint: true,
        backgroundColor: isDarkPreview ? '#1a1a1a' : '#ffffff',
        width: printableArea.scrollWidth,
        height: printableArea.scrollHeight,
      });

      // Convert to blob and download
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            throw new Error('Failed to create image');
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;

          // Generate filename with report title or default
          const fileName = previewTitle
            ? `${previewTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.png`
            : 'report.png';

          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          toast.success(t('ws-reports.export_png_success'));
        },
        'image/png',
        1.0
      );
    } catch (error) {
      console.error('PNG export failed:', error);
      toast.error(t('ws-reports.failed_export_png'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid h-fit gap-4 xl:grid-cols-3">
      <div className="grid h-fit gap-4">
        <div className="grid h-fit gap-2 rounded-lg border p-4">
          <ScoreDisplay
            healthcareVitals={healthcareVitals}
            healthcareVitalsLoading={healthcareVitalsLoading}
            isNew={isNew}
            scores={selectedLog ? (selectedLog.scores ?? null) : report.scores}
            reportId={report.id}
            onFetchNewScores={
              !isNew && !selectedLog
                ? () => updateScoresMutation.mutate()
                : undefined
            }
            isFetchingNewScores={updateScoresMutation.isPending}
            factorEnabled={factorEnabled}
          />
        </div>

        {isLoadingRejectedBase ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border p-4">
            <Loader2 className="h-6 w-6 animate-spin text-dynamic-blue" />
            <div className="text-muted-foreground text-sm">
              {t('ws-reports.loading_approved_version')}
            </div>
          </div>
        ) : (
          <UserReportForm
            isNew={isNew}
            form={form}
            submitLabel={isNew ? t('common.create') : t('common.save')}
            onSubmit={(values) => {
              if (isNew) createMutation.mutate(values);
              else updateMutation.mutate(values);
            }}
            onDelete={
              !isNew && canDeleteReports
                ? () => setShowDeleteDialog(true)
                : undefined
            }
            managerOptions={managerOptions}
            selectedManagerName={selectedManagerName ?? report.creator_name}
            onChangeManager={(name) => onChangeManagerAction?.(name)}
            canUpdate={canUpdateReports}
            canDelete={canDeleteReports}
          />
        )}

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('common.confirm_delete') || 'Delete report?'}
              </DialogTitle>
              <DialogDescription>
                {t('ws-reports.delete_confirm_message') ||
                  'This action cannot be undone. This will permanently delete the report.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
              >
                {t('common.cancel') || 'Cancel'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowDeleteDialog(false);
                  deleteMutation.mutate();
                }}
              >
                {t('common.delete') || 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* <div className="grid h-fit gap-2 rounded-lg border p-4">
          <div className="text-lg font-semibold">Report Data</div>
          <Separator />
          <pre className="scrollbar-none overflow-auto">
            {JSON.stringify(report, null, 2)}
          </pre>
        </div> */}

        {report.user_id && canCheckUserAttendance && (
          <UserMonthAttendance
            wsId={wsId}
            user={{
              id: report.user_id,
              full_name: report.user_name,
              href: `/${wsId}/users/database/${report.user_id}`,
              archived: report.user_archived,
              archived_until: report.user_archived_until,
              note: report.user_note,
            }}
            defaultIncludedGroups={[groupId || report.group_id!]}
          />
        )}
      </div>

      <div className="grid h-fit gap-4 xl:col-span-2">
        {isNew || (
          <Accordion type="single" collapsible className="rounded-lg border">
            <AccordionItem value="history" className="border-none">
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="mr-2 flex w-full items-center justify-between">
                  <div className="flex flex-row items-center gap-2 font-semibold text-lg">
                    <History className="h-4 w-4" />
                    {t('ws-reports.history')}
                  </div>
                  {logsQuery.data && (
                    <div className="text-xs opacity-70">
                      {logsQuery.data.length} {t('common.history')}
                    </div>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4">
                {logsQuery.isLoading ? (
                  <div className="text-sm opacity-70">
                    {t('common.loading')}
                  </div>
                ) : logsQuery.data && logsQuery.data.length > 0 ? (
                  <div className="space-y-6">
                    {logsQuery.data.map((log, idx) => {
                      const isLatest = idx === 0;
                      const isOldest = idx === logsQuery.data!.length - 1;
                      const actionLabel = isOldest
                        ? t('ws-reports.created_report')
                        : t('ws-reports.updated_report');
                      const label = isLatest
                        ? t('ws-reports.current_version')
                        : t('ws-reports.updated_report-number', {
                            number: logsQuery.data!.length - idx,
                          });
                      const exact = new Date(log.created_at).toLocaleString(
                        locale
                      );
                      const relative = formatRelativeTime(log.created_at);

                      // Choose icon and color based on action type
                      const IconComponent = isLatest
                        ? FileText
                        : isOldest
                          ? Plus
                          : PencilIcon;
                      // Solid background to mask the timeline line; icon uses contrasting text color
                      const bgColor = isLatest
                        ? 'bg-dynamic-blue'
                        : isOldest
                          ? 'bg-dynamic-green'
                          : 'bg-dynamic-orange';
                      const iconColor = 'text-background';

                      const isSelected = selectedLog?.id === log.id;

                      return (
                        <div key={log.id} className="relative">
                          {/* Timeline item */}
                          <button
                            type="button"
                            className={`flex cursor-pointer gap-4 ${isSelected ? 'opacity-100' : 'opacity-100'} `}
                            onClick={() =>
                              setSelectedLog((prev) =>
                                prev?.id === log.id
                                  ? null
                                  : {
                                      id: log.id,
                                      title: log.title,
                                      content: log.content,
                                      feedback: log.feedback,
                                      score: log.score ?? null,
                                      scores: log.scores ?? null,
                                    }
                              )
                            }
                            aria-pressed={isSelected}
                          >
                            {/* Timeline icon container */}
                            <div className="relative shrink-0">
                              {/* Timeline line - only between items, not after the last one */}
                              {idx < logsQuery.data!.length - 1 && (
                                <div
                                  className="absolute left-1/2 w-px bg-muted-foreground/30"
                                  style={{
                                    transform: 'translateX(-0.5px)',
                                    top: '32px', // Start after current circle
                                    height: 'calc(100% + 24px)', // Extend to next item (space-y-6 = 24px)
                                  }}
                                />
                              )}
                              {/* Timeline icon */}
                              <div
                                className={`h-8 w-8 rounded-full ${bgColor} relative z-10 flex items-center justify-center`}
                              >
                                <IconComponent
                                  className={`h-4 w-4 ${iconColor}`}
                                />
                              </div>
                            </div>

                            {/* Content */}
                            <div className={`flex-1 space-y-2`}>
                              <div
                                className={`rounded-lg border bg-card p-3 ${isSelected ? 'ring-2 ring-dynamic-blue' : ''}`}
                              >
                                <div className="font-semibold text-sm">
                                  {label}
                                </div>
                                <div className="text-muted-foreground text-sm">
                                  {log.creator_name || t('common.unknown')}{' '}
                                  {actionLabel}.
                                </div>
                              </div>

                              {/* Metadata */}
                              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                <span>{exact}</span>
                                {relative && (
                                  <>
                                    <span>•</span>
                                    <span>{relative}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm opacity-70">
                    {t('ws-reports.no_history')}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {selectedLog && (
          <div className="-mt-2 rounded-lg border bg-card p-3 text-sm print:hidden">
            <div className="flex items-center justify-between">
              <div>{t('ws-reports.viewing_history_snapshot')}</div>
              <Button
                variant="default"
                className="bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/20"
                onClick={() => setSelectedLog(null)}
              >
                <Undo className="h-4 w-4" />
                {t('ws-reports.reset_to_current')}
              </Button>
            </div>
          </div>
        )}
        <div className="-mb-2 flex items-center justify-end gap-2">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  disabled={isPendingApproval}
                  title={
                    isPendingApproval
                      ? t('ws-reports.export_blocked_not_approved')
                      : undefined
                  }
                >
                  <Download className="h-4 w-4" />
                  {t('common.export')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    handlePrintExport();
                  }}
                  className="gap-2"
                >
                  <Printer className="h-4 w-4" />
                  {t('ws-reports.print')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isExporting}
                  onClick={(e) => {
                    e.preventDefault();
                    handlePngExport();
                  }}
                  className="gap-2"
                >
                  <ImageIcon className="h-4 w-4" />
                  {isExporting
                    ? t('ws-reports.exporting_png')
                    : t('ws-reports.png')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Palette className="h-4 w-4" />
                  {t('common.theme')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => setIsDarkPreview(false)}>
                  <Sun className="h-4 w-4" />
                  {t('common.light')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsDarkPreview(true)}>
                  <Moon className="h-4 w-4" />
                  {t('common.dark')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ReportPreview
          t={t}
          lang={locale}
          parseDynamicText={parseDynamicText}
          getConfig={getConfig}
          theme={isDarkPreview ? 'dark' : 'light'}
          data={{
            title: previewTitle,
            content: previewContent,
            score: previewScore,
            feedback: previewFeedback,
          }}
          notice={
            isPendingApproval ? (
              <div className="mb-4 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldIcon className="mt-0.5 h-5 w-5 text-dynamic-orange" />
                  <div className="flex-1">
                    <div className="font-semibold text-dynamic-orange">
                      {t('ws-reports.needs_approval')}
                    </div>
                    <div className="mt-1 text-dynamic-orange/80 text-sm">
                      {t('ws-reports.needs_approval_description')}
                    </div>
                  </div>
                </div>
              </div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
