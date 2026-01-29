'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Upload,
  Wallet,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import { Progress } from '@tuturuuu/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface MoneyLoverImportDialogProps {
  wsId: string;
  currency?: string;
}

const importFormSchema = z.object({
  file: z.instanceof(File).optional(),
  delimiter: z.enum(['tab', 'semicolon', 'comma']),
});

type ImportFormValues = z.infer<typeof importFormSchema>;

interface ParsedTransaction {
  id: string;
  date: string;
  category: string;
  amount: string;
  currency: string;
  note: string;
  wallet: string;
}

interface ImportProgress {
  step: 'parsing' | 'validating' | 'uploading' | 'complete' | 'error';
  current: number;
  total: number;
  status: 'processing' | 'success' | 'error';
  message: string;
  details?: string;
}

export default function MoneyLoverImportDialog({
  wsId,
  currency = 'USD',
}: MoneyLoverImportDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ParsedTransaction[]>([]);
  const [allData, setAllData] = useState<ParsedTransaction[]>([]);
  const [fileSelected, setFileSelected] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      delimiter: 'tab',
    },
  });

  const parseCSV = (text: string, delimiter: string): ParsedTransaction[] => {
    const delimiterChar =
      delimiter === 'tab' ? '\t' : delimiter === 'semicolon' ? ';' : ',';

    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    // Skip header line
    const dataLines = lines.slice(1);

    return dataLines
      .map((line) => {
        const columns = line.split(delimiterChar).map((col) => col.trim());

        if (columns.length < 7) return null;

        return {
          id: columns[0] || '',
          date: columns[1] || '',
          category: columns[2] || '',
          amount: columns[3] || '',
          currency: columns[4] || '',
          note: columns[5] || '',
          wallet: columns[6] || '',
        };
      })
      .filter((item): item is ParsedTransaction => item !== null);
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    form.setValue('file', file);
    setFileSelected(true);

    // Read and preview file
    const text = await file.text();
    const delimiter = form.getValues('delimiter');
    const parsed = parseCSV(text, delimiter);
    setAllData(parsed);
    setPreviewData(parsed.slice(0, 5)); // Show first 5 rows
  };

  const handleDelimiterChange = async (delimiter: string) => {
    form.setValue('delimiter', delimiter as 'tab' | 'semicolon' | 'comma');

    const file = form.getValues('file');
    if (!file) return;

    // Re-parse with new delimiter
    const text = await file.text();
    const parsed = parseCSV(text, delimiter);
    setAllData(parsed);
    setPreviewData(parsed.slice(0, 5));
  };

  // Calculate import statistics
  const stats = {
    totalTransactions: allData.length,
    uniqueCategories: new Set(allData.map((t) => t.category)).size,
    uniqueWallets: new Set(allData.map((t) => t.wallet)).size,
  };

  const onSubmit = async (data: ImportFormValues) => {
    if (!data.file) {
      toast.error(t('money-lover-import.no_file_selected'));
      return;
    }

    setLoading(true);
    setProgress({
      step: 'parsing',
      current: 0,
      total: 100,
      status: 'processing',
      message: t('money-lover-import.step_parsing'),
    });

    try {
      // Step 1: Parse CSV
      const text = await data.file.text();
      console.log('File read, size:', text.length);

      const transactions = parseCSV(text, data.delimiter);
      console.log('Parsed transactions:', transactions.length);

      if (transactions.length === 0) {
        setProgress({
          step: 'parsing',
          current: 0,
          total: 0,
          status: 'error',
          message: t('money-lover-import.error_no_data'),
        });
        toast.error(t('money-lover-import.error_no_data'));
        setLoading(false);
        return;
      }

      setProgress({
        step: 'validating',
        current: transactions.length,
        total: transactions.length,
        status: 'processing',
        message: t('money-lover-import.step_validating', {
          count: transactions.length,
        }),
      });

      // Step 2: Send to API
      const formData = new FormData();
      formData.append('transactions', JSON.stringify(transactions));

      console.log('Sending to API:', transactions.length, 'transactions');

      const BATCH_SIZE = 50;
      const batchCount = Math.ceil(transactions.length / BATCH_SIZE);

      setProgress({
        step: 'uploading',
        current: 0,
        total: transactions.length,
        status: 'processing',
        message: t('money-lover-import.step_uploading'),
        details:
          batchCount > 1
            ? t('money-lover-import.processing_batches', {
                batches: batchCount,
                size: BATCH_SIZE,
              })
            : undefined,
      });

      const res = await fetch(
        `/api/workspaces/${wsId}/transactions/import/money-lover`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!res.ok) {
        const errorResult = await res.json();
        setProgress({
          step: 'error',
          current: 0,
          total: transactions.length,
          status: 'error',
          message: errorResult.message || t('money-lover-import.error'),
        });
        toast.error(errorResult.message || t('money-lover-import.error'));
        console.error('Import failed:', errorResult);
        setLoading(false);
        return;
      }

      // Handle streaming response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let finalResult: any = null;

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6));
                console.log('Stream data:', data);

                if (data.type === 'progress') {
                  setProgress({
                    step: 'uploading',
                    current: data.current,
                    total: data.total,
                    status: 'processing',
                    message: t('money-lover-import.step_uploading'),
                    details: t('money-lover-import.batch_progress', {
                      batch: data.batch,
                      totalBatches: data.totalBatches,
                      current: data.current,
                      total: data.total,
                    }),
                  });
                } else if (data.type === 'complete') {
                  finalResult = data;
                } else if (data.type === 'error') {
                  throw new Error(data.message);
                }
              }
            }
          }
        } catch (streamError) {
          console.error('Stream error:', streamError);
          setProgress({
            step: 'error',
            current: 0,
            total: transactions.length,
            status: 'error',
            message:
              streamError instanceof Error
                ? streamError.message
                : t('money-lover-import.error'),
          });
          toast.error(t('money-lover-import.error'));
          setLoading(false);
          return;
        }
      }

      // Process final result
      if (finalResult) {
        setProgress({
          step: 'complete',
          current: finalResult.imported || 0,
          total: transactions.length,
          status: 'success',
          message: t('money-lover-import.step_complete', {
            count: finalResult.imported || 0,
          }),
        });

        toast.success(
          t('money-lover-import.success', { count: finalResult.imported || 0 })
        );

        if (finalResult.errors && finalResult.errors.length > 0) {
          console.error('Import errors:', finalResult.errors);
          setProgress({
            step: 'complete',
            current: finalResult.imported || 0,
            total: transactions.length,
            status: 'success',
            message: t('money-lover-import.step_complete', {
              count: finalResult.imported || 0,
            }),
            details: t('money-lover-import.import_with_errors', {
              errors: finalResult.errors.length,
            }),
          });
          toast.warning(
            t('money-lover-import.import_with_errors', {
              errors: finalResult.errors.length,
            })
          );
        }

        // queryClient.invalidateQueries({
        //   queryKey: [`/api/workspaces/${wsId}/transactions`],
        // });
        queryClient.invalidateQueries({
          queryKey: [`/api/workspaces/${wsId}/transactions/infinite`],
        });
        router.refresh();

        // Wait a bit before clearing
        setTimeout(() => {
          form.reset();
          setPreviewData([]);
          setAllData([]);
          setFileSelected(false);
          setProgress(null);
        }, 2000);
      }
    } catch (error) {
      console.error('Import error:', error);
      setProgress({
        step: 'error',
        current: 0,
        total: 0,
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('money-lover-import.error'),
      });
      toast.error(t('money-lover-import.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('money-lover-import.import_from_money_lover')}
        </DialogTitle>
        <DialogDescription>
          {t('money-lover-import.description')}
        </DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="delimiter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('money-lover-import.delimiter')}</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={handleDelimiterChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="tab">
                      {t('money-lover-import.delimiter_tab')}
                    </SelectItem>
                    <SelectItem value="semicolon">
                      {t('money-lover-import.delimiter_semicolon')}
                    </SelectItem>
                    <SelectItem value="comma">
                      {t('money-lover-import.delimiter_comma')}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t('money-lover-import.delimiter_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="file"
            render={() => (
              <FormItem>
                <FormLabel>{t('money-lover-import.csv_file')}</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileChange}
                  />
                </FormControl>
                <FormDescription>
                  {t('money-lover-import.file_description')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {previewData.length > 0 && (
            <div className="space-y-4">
              {/* Statistics */}
              <div className="grid gap-3 rounded-lg border bg-linear-to-br from-primary/5 to-primary/10 p-4 md:grid-cols-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-background shadow-sm">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs">
                      {t('money-lover-import.transactions')}
                    </p>
                    <p className="font-bold text-xl tabular-nums">
                      {stats.totalTransactions.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-background shadow-sm">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs">
                      {t('money-lover-import.categories')}
                    </p>
                    <p className="font-bold text-xl tabular-nums">
                      {stats.uniqueCategories.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-background shadow-sm">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground text-xs">
                      {t('money-lover-import.wallets')}
                    </p>
                    <p className="font-bold text-xl tabular-nums">
                      {stats.uniqueWallets.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Preview Table */}
              <div className="space-y-2.5">
                <h3 className="font-semibold text-sm">
                  {t('money-lover-import.preview')}
                </h3>
                <div className="max-h-64 overflow-auto rounded-lg border shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide">
                          {t('money-lover-import.date')}
                        </th>
                        <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide">
                          {t('money-lover-import.category')}
                        </th>
                        <th className="p-2.5 text-right font-semibold text-xs uppercase tracking-wide">
                          {t('money-lover-import.amount')}
                        </th>
                        <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide">
                          {t('money-lover-import.wallet')}
                        </th>
                        <th className="p-2.5 text-left font-semibold text-xs uppercase tracking-wide">
                          {t('money-lover-import.note')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, idx) => {
                        const amount = parseFloat(row.amount);
                        const isExpense = amount < 0;

                        return (
                          <tr
                            key={idx}
                            className="border-t transition-colors hover:bg-muted/30"
                          >
                            <td className="p-2.5 text-muted-foreground text-xs">
                              {row.date}
                            </td>
                            <td className="p-2.5">
                              <Badge variant="outline" className="font-medium">
                                {row.category}
                              </Badge>
                            </td>
                            <td
                              className={`p-2.5 text-right font-bold tabular-nums ${
                                isExpense
                                  ? 'text-dynamic-red'
                                  : 'text-dynamic-green'
                              }`}
                            >
                              {Intl.NumberFormat(
                                currency === 'VND' ? 'vi-VN' : 'en-US',
                                {
                                  style: 'currency',
                                  currency,
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                  signDisplay: 'always',
                                }
                              ).format(amount)}
                            </td>
                            <td className="p-2.5">
                              <Badge
                                variant="secondary"
                                className="font-medium"
                              >
                                {row.wallet}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-muted-foreground text-xs">
                              {row.note || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted-foreground text-xs italic">
                  {t('money-lover-import.preview_note')}
                </p>
              </div>
            </div>
          )}

          {/* Progress Display */}
          {progress && (
            <div className="space-y-4 rounded-lg border bg-linear-to-br from-muted/50 to-muted/30 p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="mt-0.5">
                  {progress.status === 'processing' && (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  )}
                  {progress.status === 'success' && (
                    <CheckCircle2 className="h-6 w-6 text-dynamic-green" />
                  )}
                  {progress.status === 'error' && (
                    <AlertCircle className="h-6 w-6 text-dynamic-red" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <p className="font-semibold text-sm leading-none">
                    {progress.message}
                  </p>
                  {progress.details && (
                    <p className="text-muted-foreground text-xs">
                      {progress.details}
                    </p>
                  )}
                  {progress.total > 0 && progress.step !== 'parsing' && (
                    <div className="flex items-baseline gap-2 pt-1">
                      <span className="font-mono font-semibold text-lg tabular-nums">
                        {progress.current.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        / {progress.total.toLocaleString()}{' '}
                        {t('money-lover-import.transactions').toLowerCase()}
                      </span>
                      <span className="ml-auto text-muted-foreground text-xs">
                        {Math.round((progress.current / progress.total) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {progress.status === 'processing' &&
                progress.total > 0 &&
                progress.step !== 'parsing' && (
                  <Progress
                    value={(progress.current / progress.total) * 100}
                    className="h-2.5"
                  />
                )}
              {progress.status === 'success' && (
                <div className="flex items-center gap-2 rounded-md border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  <p className="font-medium text-dynamic-green text-xs">
                    {t('money-lover-import.import_successful')}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="secondary"
                disabled={loading && progress?.status === 'processing'}
              >
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading || !fileSelected}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.processing')}
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('money-lover-import.import')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
