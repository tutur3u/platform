'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Code,
  Copy,
  Eye,
  FileText,
  Globe,
  Hash,
  Laptop,
  Mail,
  Server,
  User,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { EmailAuditRecord } from './columns';

interface EmailDetailsDialogProps {
  entry: EmailAuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4" />;
    case 'sent':
      return <CheckCircle className="h-4 w-4" />;
    case 'failed':
      return <XCircle className="h-4 w-4" />;
    case 'bounced':
      return <AlertTriangle className="h-4 w-4" />;
    case 'complained':
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
};

const getStatusBadge = (status: string) => {
  const statusColors: Record<string, string> = {
    pending:
      'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/30',
    sent: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800/30',
    failed:
      'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/30',
    bounced:
      'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800/30',
    complained:
      'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/30',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'flex items-center gap-1.5 px-3 py-1',
        statusColors[status]
      )}
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
  const [showHtmlSource, setShowHtmlSource] = useState(false);

  if (!entry) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t('copied'), {
      description: `${label} ${t('copied_to_clipboard')}`,
    });
  };

  const formatAddresses = (addresses: string[]) => {
    if (!addresses || addresses.length === 0) return null;
    return addresses.map((addr) => (
      <div
        key={addr}
        className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-sm"
      >
        <Mail className="h-3 w-3 text-muted-foreground" />
        <span className="break-all">{addr}</span>
      </div>
    ));
  };

  // Access html_content and text_content from the entry
  const htmlContent = (entry as any).html_content as string | null | undefined;
  const textContent = (entry as any).text_content as string | null | undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 p-0 lg:max-w-6xl">
        <DialogHeader className="border-b p-6 pb-4">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Mail className="h-5 w-5" />
              {t('email_details')}
            </DialogTitle>
            {getStatusBadge(entry.status)}
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex flex-1 flex-col">
          <div className="border-b px-6">
            <TabsList className="h-auto w-full justify-start gap-4 rounded-none border-none bg-transparent p-0">
              <TabsTrigger
                value="details"
                className="relative rounded-none border-transparent border-b-2 bg-transparent px-0 pt-2 pb-3 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <FileText className="mr-2 h-4 w-4" />
                {t('email_details')}
              </TabsTrigger>
              <TabsTrigger
                value="html"
                className="relative rounded-none border-transparent border-b-2 bg-transparent px-0 pt-2 pb-3 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <Code className="mr-2 h-4 w-4" />
                {t('html_preview')}
              </TabsTrigger>
              <TabsTrigger
                value="text"
                className="relative rounded-none border-transparent border-b-2 bg-transparent px-0 pt-2 pb-3 font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                <FileText className="mr-2 h-4 w-4" />
                {t('plain_text')}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="mt-0 flex-1">
            <ScrollArea className="h-[calc(90vh-180px)]">
              <div className="space-y-6 p-6">
                {/* Header Summary */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h2 className="font-semibold text-2xl leading-tight tracking-tight">
                      {entry.subject}
                    </h2>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground text-sm">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span className="font-medium text-foreground">
                          {entry.source_name}
                        </span>
                        <span className="text-muted-foreground">
                          &lt;{entry.source_email}&gt;
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>
                          {moment(entry.created_at).format(
                            'MMM DD, YYYY HH:mm:ss'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Error Alert */}
                  {entry.error_message && (
                    <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div className="space-y-1 overflow-hidden">
                        <h4 className="font-semibold">{t('error_details')}</h4>
                        <pre className="whitespace-pre-wrap break-all font-mono text-sm opacity-90">
                          {entry.error_message}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Main Content - Left Column */}
                  <div className="space-y-6 lg:col-span-2">
                    {/* Recipients Card */}
                    <div className="rounded-lg border bg-card shadow-sm">
                      <div className="border-b px-4 py-3">
                        <h3 className="font-semibold text-sm">
                          {t('email_content')}
                        </h3>
                      </div>
                      <div className="space-y-4 p-4">
                        <div className="space-y-2">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">
                            {t('to_addresses')}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {formatAddresses(entry.to_addresses) || (
                              <span className="text-muted-foreground text-sm">
                                —
                              </span>
                            )}
                          </div>
                        </div>

                        {(entry.cc_addresses?.length > 0 ||
                          entry.bcc_addresses?.length > 0) && (
                          <>
                            <Separator />
                            <div className="grid gap-4 sm:grid-cols-2">
                              {entry.cc_addresses?.length > 0 && (
                                <div className="space-y-2">
                                  <span className="text-muted-foreground text-xs uppercase tracking-wider">
                                    {t('cc_addresses')}
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {formatAddresses(entry.cc_addresses)}
                                  </div>
                                </div>
                              )}
                              {entry.bcc_addresses?.length > 0 && (
                                <div className="space-y-2">
                                  <span className="text-muted-foreground text-xs uppercase tracking-wider">
                                    {t('bcc_addresses')}
                                  </span>
                                  <div className="flex flex-wrap gap-2">
                                    {formatAddresses(entry.bcc_addresses)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {entry.reply_to_addresses?.length > 0 && (
                          <>
                            <Separator />
                            <div className="space-y-2">
                              <span className="text-muted-foreground text-xs uppercase tracking-wider">
                                {t('reply_to')}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {formatAddresses(entry.reply_to_addresses)}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Context Card */}
                    {(entry.entity_type ||
                      entry.entity_id ||
                      entry.users ||
                      entry.workspaces) && (
                      <div className="rounded-lg border bg-card shadow-sm">
                        <div className="border-b px-4 py-3">
                          <h3 className="font-semibold text-sm">
                            {t('sender_context')}
                          </h3>
                        </div>
                        <div className="grid gap-4 p-4 sm:grid-cols-2">
                          {entry.users && (
                            <div>
                              <span className="text-muted-foreground text-xs">
                                {t('sent_by')}
                              </span>
                              <div className="mt-1 flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">
                                  {entry.users.display_name}
                                </span>
                              </div>
                            </div>
                          )}
                          {entry.workspaces && (
                            <div>
                              <span className="text-muted-foreground text-xs">
                                {t('workspace')}
                              </span>
                              <div className="mt-1 flex items-center gap-2">
                                <Laptop className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-sm">
                                  {entry.workspaces.name}
                                </span>
                              </div>
                            </div>
                          )}
                          {entry.entity_type && (
                            <div>
                              <span className="text-muted-foreground text-xs">
                                {t('entity_type')}
                              </span>
                              <div className="mt-1">
                                <Badge variant="outline" className="capitalize">
                                  {entry.entity_type}
                                </Badge>
                              </div>
                            </div>
                          )}
                          {entry.entity_id && (
                            <div>
                              <span className="text-muted-foreground text-xs">
                                {t('entity_id')}
                              </span>
                              <div className="mt-1">
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {entry.entity_id}
                                </code>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sidebar - Right Column */}
                  <div className="space-y-6">
                    {/* Timeline Card */}
                    <div className="rounded-lg border bg-card shadow-sm">
                      <div className="border-b px-4 py-3">
                        <h3 className="font-semibold text-sm">
                          {t('status_timeline')}
                        </h3>
                      </div>
                      <div className="p-4">
                        <div className="relative border-l pl-4 dark:border-muted">
                          <div className="mb-6 last:mb-0">
                            <div className="-left-1.5 absolute mt-1.5 h-3 w-3 rounded-full border border-background bg-primary" />
                            <div className="font-medium text-sm">
                              {t('created_at')}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {moment(entry.created_at).format(
                                'MMM DD, YYYY HH:mm:ss'
                              )}
                            </div>
                          </div>
                          {entry.sent_at && (
                            <div className="mb-6 last:mb-0">
                              <div className="-left-1.5 absolute mt-1.5 h-3 w-3 rounded-full border border-background bg-green-500" />
                              <div className="font-medium text-sm">
                                {t('sent_at')}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {moment(entry.sent_at).format(
                                  'MMM DD, YYYY HH:mm:ss'
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Technical Details Card */}
                    <div className="rounded-lg border bg-card shadow-sm">
                      <div className="border-b px-4 py-3">
                        <h3 className="font-semibold text-sm">
                          {t('technical_details')}
                        </h3>
                      </div>
                      <div className="space-y-4 p-4">
                        <div>
                          <span className="text-muted-foreground text-xs">
                            {t('provider')}
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-sm uppercase">
                              {entry.provider}
                            </span>
                          </div>
                        </div>

                        {entry.template_type && (
                          <div>
                            <span className="text-muted-foreground text-xs">
                              {t('template_type')}
                            </span>
                            <div className="mt-1">
                              <Badge variant="secondary">
                                {entry.template_type}
                              </Badge>
                            </div>
                          </div>
                        )}

                        {entry.message_id && (
                          <div>
                            <span className="text-muted-foreground text-xs">
                              {t('message_id')}
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <code className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-xs">
                                {entry.message_id}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0"
                                onClick={() =>
                                  copyToClipboard(
                                    entry.message_id!,
                                    t('message_id')
                                  )
                                }
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {(entry.ip_address || entry.user_agent) && (
                          <>
                            <Separator />
                            <div className="space-y-3">
                              {entry.ip_address && (
                                <div>
                                  <span className="text-muted-foreground text-xs">
                                    {t('ip_address')}
                                  </span>
                                  <div className="mt-1 flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                    <code className="text-xs">
                                      {entry.ip_address === '::1'
                                        ? 'localhost'
                                        : entry.ip_address}
                                    </code>
                                  </div>
                                </div>
                              )}
                              {entry.user_agent && (
                                <div>
                                  <span className="text-muted-foreground text-xs">
                                    {t('user_agent')}
                                  </span>
                                  <div
                                    className="mt-1 line-clamp-2 text-xs"
                                    title={entry.user_agent}
                                  >
                                    {entry.user_agent}
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {entry.content_hash && (
                          <div>
                            <span className="text-muted-foreground text-xs">
                              {t('content_hash')}
                            </span>
                            <div className="mt-1 flex items-center gap-2">
                              <Hash className="h-4 w-4 text-muted-foreground" />
                              <code className="flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-xs">
                                {entry.content_hash}
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="html" className="mt-0 flex-1">
            <div className="flex h-[calc(90vh-180px)] flex-col">
              {htmlContent ? (
                <>
                  <div className="flex items-center justify-between border-b px-4 py-2">
                    <span className="text-muted-foreground text-sm">
                      {t('html_preview')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowHtmlSource(!showHtmlSource)}
                      className="gap-2"
                    >
                      {showHtmlSource ? (
                        <>
                          <Eye className="h-4 w-4" />
                          {t('view_preview')}
                        </>
                      ) : (
                        <>
                          <Code className="h-4 w-4" />
                          {t('view_source')}
                        </>
                      )}
                    </Button>
                  </div>
                  {showHtmlSource ? (
                    <ScrollArea className="flex-1">
                      <pre className="whitespace-pre-wrap break-all p-4 font-mono text-sm">
                        {htmlContent}
                      </pre>
                    </ScrollArea>
                  ) : (
                    <iframe
                      srcDoc={htmlContent}
                      className="flex-1 border-0 bg-white"
                      sandbox="allow-same-origin"
                      title="Email HTML Preview"
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
                  <Code className="h-12 w-12 opacity-30" />
                  <p className="text-sm">{t('no_html_content')}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="text" className="mt-0 flex-1">
            <div className="flex h-[calc(90vh-180px)] flex-col">
              {textContent ? (
                <ScrollArea className="flex-1">
                  <pre className="wrap-break-word whitespace-pre-wrap p-6 font-mono text-sm">
                    {textContent}
                  </pre>
                </ScrollArea>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
                  <FileText className="h-12 w-12 opacity-30" />
                  <p className="text-sm">{t('no_text_content')}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
