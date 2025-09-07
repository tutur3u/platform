'use client';

import { calculateCost, formatCost } from '../utils/cost-calculator';
import type { WorkspaceAIExecution } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Hash,
  MessageSquare,
  Settings,
  TrendingUp,
  Zap,
} from 'lucide-react';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface ExecutionDetailDialogProps {
  execution: WorkspaceAIExecution | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExecutionDetailDialog({
  execution,
  open,
  onOpenChange,
}: ExecutionDetailDialogProps) {
  const t = useTranslations('ai-execution-detail');
  const [collapsedSections, setCollapsedSections] = useState<{
    systemPrompt: boolean;
    input: boolean;
    output: boolean;
  }>({
    systemPrompt: false,
    input: false,
    output: false,
  });

  const cost = execution
    ? calculateCost(execution.model_id, {
        inputTokens: execution.input_tokens,
        outputTokens: execution.output_tokens,
        reasoningTokens: execution.reasoning_tokens,
        totalTokens: execution.total_tokens,
      })
    : null;

  const formatDate = (dateString: string) => {
    return moment(dateString).format('DD/MM/YYYY HH:mm:ss');
  };

  const getFinishReasonColor = (reason: string) => {
    switch (reason.toLowerCase()) {
      case 'stop':
        return 'bg-success/10 text-success border-success/20';
      case 'length':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'content_filter':
        return 'bg-danger/10 text-danger border-danger/20';
      default:
        return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Memoize the markdown components to prevent recreation
  const markdownComponents = useMemo(
    () => ({
      h1({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h1 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h1>
        );
      },
      h2({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h2 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h2>
        );
      },
      h3({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h3 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h3>
        );
      },
      h4({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h4 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h4>
        );
      },
      h5({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h5 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h5>
        );
      },
      h6({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <h6 className="mt-6 mb-2 text-foreground" {...props}>
            {children}
          </h6>
        );
      },
      strong({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <strong className="font-semibold text-foreground" {...props}>
            {children}
          </strong>
        );
      },
      a({
        children,
        href,
        ...props
      }: {
        children?: React.ReactNode;
        href?: string;
      }) {
        if (!href) return <>{children}</>;

        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
            {...props}
          >
            {children}
          </a>
        );
      },
      p({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <p className="mb-2 text-foreground last:mb-0" {...props}>
            {children}
          </p>
        );
      },
      blockquote({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <blockquote
            className="border-foreground/30 border-l-4 pl-2 text-foreground/80"
            {...props}
          >
            {children}
          </blockquote>
        );
      },
      code({
        className,
        children,
        ...props
      }: {
        node?: React.ReactNode;
        className?: string;
        children?: React.ReactNode;
      }) {
        const match = /language-(\w+)/.exec(className || '');

        return match ? (
          <pre
            className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border bg-foreground/5 p-4"
            {...props}
          >
            <code className={`language-${match[1]} break-words`}>
              {String(children).replace(/\n$/, '')}
            </code>
          </pre>
        ) : (
          <code
            className={cn(
              'break-words font-semibold text-foreground',
              className
            )}
            {...props}
          >
            {children}
          </code>
        );
      },
      table({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed break-words" {...props}>
              {children}
            </table>
          </div>
        );
      },
      th({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <th className="break-words text-foreground" {...props}>
            {children}
          </th>
        );
      },
      pre({ children, ...props }: { children?: React.ReactNode }) {
        return (
          <pre
            className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border bg-foreground/5"
            {...props}
          >
            {children}
          </pre>
        );
      },
      hr({ ...props }: { children?: React.ReactNode }) {
        return <hr className="border-border" {...props} />;
      },
    }),
    []
  );

  if (!execution) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {t('execution_details') || 'Execution Details'}
          </DialogTitle>
          <DialogDescription>
            {t('execution_details_description') ||
              'Detailed information about this AI execution'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Hash className="h-5 w-5" />
                {t('basic_information') || 'Basic Information'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('execution_id') || 'Execution ID'}
                  </label>
                  <p className="mt-1 font-mono text-sm">{execution.id}</p>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('model') || 'Model'}
                  </label>
                  <p className="mt-1 font-medium">{execution.model_id}</p>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('finish_reason') || 'Finish Reason'}
                  </label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className={getFinishReasonColor(execution.finish_reason)}
                    >
                      {execution.finish_reason}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('created_at') || 'Created At'}
                  </label>
                  <p className="mt-1 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    {formatDate(execution.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Token Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                {t('token_usage') || 'Token Usage'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="font-bold text-2xl text-primary">
                    {execution.input_tokens.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('input_tokens') || 'Input Tokens'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-2xl text-success">
                    {execution.output_tokens.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('output_tokens') || 'Output Tokens'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-2xl text-warning">
                    {execution.reasoning_tokens.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('reasoning_tokens') || 'Reasoning Tokens'}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-2xl text-info">
                    {execution.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {t('total_tokens') || 'Total Tokens'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cost Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5" />
                {t('cost_breakdown') || 'Cost Breakdown'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="text-center">
                    <div className="font-bold text-2xl text-primary">
                      {cost != null ? formatCost(cost.inputCost) : 'N/A'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {t('input_cost') || 'Input Cost'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-2xl text-success">
                      {cost != null ? formatCost(cost.outputCost) : 'N/A'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {t('output_cost') || 'Output Cost'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-2xl text-warning">
                      {cost != null ? formatCost(cost.reasoningCost) : 'N/A'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {t('reasoning_cost') || 'Reasoning Cost'}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-2xl">
                      {cost != null ? formatCost(cost.totalCostUSD) : 'N/A'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {cost != null
                        ? formatCost(cost.totalCostVND, 'VND')
                        : 'N/A'}
                    </div>
                  </div>
                  <Badge variant="secondary" className="px-4 py-2 text-lg">
                    {t('total_cost') || 'Total Cost'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Prompt */}
          <Card>
            <CardHeader
              className="cursor-pointer"
              onClick={() => toggleSection('systemPrompt')}
            >
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  {t('system_prompt') || 'System Prompt'}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSection('systemPrompt');
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {collapsedSections.systemPrompt ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!collapsedSections.systemPrompt && (
                <div
                  className={cn(
                    'flex-1 space-y-2',
                    'prose dark:prose-invert w-full min-w-full break-words text-foreground',
                    'prose-p:break-words prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden',
                    'prose-code:break-words prose-code:before:hidden prose-code:after:hidden',
                    'prose-pre:break-words prose-pre:p-2 prose-li:marker:text-foreground/80',
                    'prose-th:border prose-tr:border-border prose-th:border-b-4',
                    'prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center',
                    'prose-td:break-words prose-td:border prose-td:p-2 prose-th:text-lg'
                  )}
                >
                  <MemoizedReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    // biome-ignore lint/suspicious/noExplicitAny: <custom components>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    components={markdownComponents as any}
                  >
                    {execution.system_prompt}
                  </MemoizedReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Input and Output */}
          <div className="grid @md:grid-cols-2 gap-4">
            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleSection('input')}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    {t('input') || 'Input'}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('input');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {collapsedSections.input ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </CardTitle>
                <CardDescription>
                  {t('user_input_description') || 'User provided input'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!collapsedSections.input && (
                  <div className="max-h-64 overflow-y-auto">
                    <div
                      className={cn(
                        'flex-1 space-y-2',
                        'prose dark:prose-invert w-full min-w-full break-words text-foreground',
                        'prose-p:break-words prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden',
                        'prose-code:break-words prose-code:before:hidden prose-code:after:hidden',
                        'prose-pre:break-words prose-pre:p-2 prose-li:marker:text-foreground/80',
                        'prose-th:border prose-tr:border-border prose-th:border-b-4',
                        'prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center',
                        'prose-td:break-words prose-td:border prose-td:p-2 prose-th:text-lg'
                      )}
                    >
                      <MemoizedReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        // biome-ignore lint/suspicious/noExplicitAny: <custom components>
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        components={markdownComponents as any}
                      >
                        {execution.input}
                      </MemoizedReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                className="cursor-pointer"
                onClick={() => toggleSection('output')}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('output') || 'Output'}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSection('output');
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {collapsedSections.output ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </CardTitle>
                <CardDescription>
                  {t('ai_output_description') || 'AI generated response'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!collapsedSections.output && (
                  <div className="max-h-64 overflow-y-auto">
                    <div
                      className={cn(
                        'flex-1 space-y-2',
                        'prose dark:prose-invert w-full min-w-full break-words text-foreground',
                        'prose-p:break-words prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden',
                        'prose-code:break-words prose-code:before:hidden prose-code:after:hidden',
                        'prose-pre:break-words prose-pre:p-2 prose-li:marker:text-foreground/80',
                        'prose-th:border prose-tr:border-border prose-th:border-b-4',
                        'prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center',
                        'prose-td:break-words prose-td:border prose-td:p-2 prose-th:text-lg'
                      )}
                    >
                      <MemoizedReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        // biome-ignore lint/suspicious/noExplicitAny: <custom components>
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        components={markdownComponents as any}
                      >
                        {execution.output}
                      </MemoizedReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Additional Metadata */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Hash className="h-5 w-5" />
                {t('metadata') || 'Metadata'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('api_key_id') || 'API Key ID'}
                  </label>
                  <p className="mt-1 font-mono text-sm">
                    {execution.api_key_id}
                  </p>
                </div>
                <div>
                  <label className="font-medium text-muted-foreground text-sm">
                    {t('workspace_id') || 'Workspace ID'}
                  </label>
                  <p className="mt-1 font-mono text-sm">{execution.ws_id}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
