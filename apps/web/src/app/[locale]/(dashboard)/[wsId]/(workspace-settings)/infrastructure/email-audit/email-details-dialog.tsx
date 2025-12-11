'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Copy,
  Mail,
  XCircle,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import type { EmailAuditRecord } from './columns';

interface EmailDetailsDialogProps {
  entry: EmailAuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'sent':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'bounced':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'complained':
      return <AlertCircle className="h-4 w-4 text-purple-500" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
};

const getStatusBadge = (status: string) => {
  const statusColors: Record<string, string> = {
    pending:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    bounced:
      'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    complained:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  };

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 ${statusColors[status] || ''}`}
    >
      {getStatusIcon(status)}
      <span className="capitalize">{status}</span>
    </Badge>
  );
};

export function EmailDetailsDialog({
  entry,
  open,
  onOpenChange,
}: EmailDetailsDialogProps) {
  const t = useTranslations('email-audit-data-table');

  if (!entry) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('copied'), {
      description: `${label} ${t('copied_to_clipboard')}`,
    });
  };

  const formatAddresses = (addresses: string[]) => {
    if (!addresses || addresses.length === 0) return '—';
    return addresses.join(', ');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {t('email_details')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6 pr-4">
            {/* Status & Timeline Section */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold text-sm">
                {t('status_timeline')}
              </h3>
              <div className="grid gap-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    {t('status')}
                  </span>
                  {getStatusBadge(entry.status)}
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('created_at')}
                    </span>
                    <p className="font-medium">
                      {moment(entry.created_at).format('MMM DD, YYYY HH:mm:ss')}
                    </p>
                  </div>
                  {entry.sent_at && (
                    <div>
                      <span className="text-muted-foreground">
                        {t('sent_at')}
                      </span>
                      <p className="font-medium">
                        {moment(entry.sent_at).format('MMM DD, YYYY HH:mm:ss')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Error Message Section (if applicable) */}
            {entry.error_message && (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-semibold text-red-600 text-sm dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  {t('error_details')}
                </h3>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                  <pre className="whitespace-pre-wrap break-all text-red-700 text-sm dark:text-red-300">
                    {entry.error_message}
                  </pre>
                </div>
              </div>
            )}

            {/* Email Content Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('email_content')}</h3>
              <div className="grid gap-3 rounded-lg border p-4">
                <div>
                  <span className="text-muted-foreground text-sm">
                    {t('subject')}
                  </span>
                  <p className="font-medium">{entry.subject}</p>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('source_email')}
                    </span>
                    <p className="font-medium">{entry.source_name}</p>
                    <p className="text-muted-foreground">
                      {entry.source_email}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {t('to_addresses')}
                    </span>
                    <p className="break-all font-medium">
                      {formatAddresses(entry.to_addresses)}
                    </p>
                  </div>
                </div>
                {(entry.cc_addresses?.length > 0 ||
                  entry.bcc_addresses?.length > 0) && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {entry.cc_addresses?.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">
                            {t('cc_addresses')}
                          </span>
                          <p className="break-all">
                            {formatAddresses(entry.cc_addresses)}
                          </p>
                        </div>
                      )}
                      {entry.bcc_addresses?.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">
                            {t('bcc_addresses')}
                          </span>
                          <p className="break-all">
                            {formatAddresses(entry.bcc_addresses)}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {entry.reply_to_addresses?.length > 0 && (
                  <>
                    <Separator />
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {t('reply_to')}
                      </span>
                      <p>{formatAddresses(entry.reply_to_addresses)}</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Provider & Tracking Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">
                {t('provider_tracking')}
              </h3>
              <div className="grid gap-3 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('provider')}
                    </span>
                    <p>
                      <Badge variant="outline">
                        {entry.provider.toUpperCase()}
                      </Badge>
                    </p>
                  </div>
                  {entry.template_type && (
                    <div>
                      <span className="text-muted-foreground">
                        {t('template_type')}
                      </span>
                      <p>
                        <Badge variant="secondary">{entry.template_type}</Badge>
                      </p>
                    </div>
                  )}
                </div>
                {entry.message_id && (
                  <>
                    <Separator />
                    <div className="text-sm">
                      <span className="text-muted-foreground">
                        {t('message_id')}
                      </span>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">
                          {entry.message_id}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(entry.message_id!, t('message_id'))
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Entity Reference Section */}
            {(entry.entity_type || entry.entity_id) && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">
                  {t('entity_reference')}
                </h3>
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
                  {entry.entity_type && (
                    <div>
                      <span className="text-muted-foreground">
                        {t('entity_type')}
                      </span>
                      <p className="capitalize">{entry.entity_type}</p>
                    </div>
                  )}
                  {entry.entity_id && (
                    <div>
                      <span className="text-muted-foreground">
                        {t('entity_id')}
                      </span>
                      <code className="rounded bg-muted px-2 py-1 text-xs">
                        {entry.entity_id}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sender & Context Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">{t('sender_context')}</h3>
              <div className="grid gap-3 rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">
                      {t('sent_by')}
                    </span>
                    <p className="font-medium">
                      {entry.users?.display_name || t('system')}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {t('workspace')}
                    </span>
                    <p className="font-medium">
                      {entry.workspaces?.name || '—'}
                    </p>
                  </div>
                </div>
                {(entry.ip_address || entry.user_agent) && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {entry.ip_address && (
                        <div>
                          <span className="text-muted-foreground">
                            {t('ip_address')}
                          </span>
                          <code className="block rounded bg-muted px-2 py-1 text-xs">
                            {entry.ip_address === '::1'
                              ? 'localhost'
                              : entry.ip_address}
                          </code>
                        </div>
                      )}
                      {entry.user_agent && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">
                            {t('user_agent')}
                          </span>
                          <p
                            className="truncate text-xs"
                            title={entry.user_agent}
                          >
                            {entry.user_agent}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Technical Details Section */}
            {entry.content_hash && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">
                  {t('technical_details')}
                </h3>
                <div className="rounded-lg border p-4 text-sm">
                  <span className="text-muted-foreground">
                    {t('content_hash')}
                  </span>
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-xs">
                    {entry.content_hash}
                  </code>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
