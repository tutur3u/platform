'use client';

import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  Keyboard,
  Loader2,
  Search,
  Sparkles,
  Square,
  TrendingUp,
  Wand2,
  XCircle,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useCallback, useEffect, useMemo, useState } from 'react';

type TranslationMessages = Record<string, any>;

interface TranslationComparisonProps {
  enMessages: TranslationMessages;
  viMessages: TranslationMessages;
  canGenerateWithAI: boolean;
}

interface FlatTranslation {
  key: string;
  enValue: string | null;
  viValue: string | null;
  status: 'complete' | 'missing-vi' | 'missing-en';
}

function flattenMessages(
  obj: TranslationMessages,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenMessages(value, newKey));
    } else {
      result[newKey] = String(value);
    }
  }

  return result;
}

export default function TranslationsComparison({
  enMessages,
  viMessages,
  canGenerateWithAI,
}: TranslationComparisonProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedTranslation, setSelectedTranslation] =
    useState<FlatTranslation | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [translatedNamespaces, setTranslatedNamespaces] = useState<string[]>(
    []
  );
  const [currentNamespace, setCurrentNamespace] = useState<string>('');
  const [parsedTranslations, setParsedTranslations] = useState<
    Record<string, string>
  >({});
  const [totalNamespaces, setTotalNamespaces] = useState(0);
  const [streamingStats, setStreamingStats] = useState({
    totalKeys: 0,
    completedKeys: 0,
    totalChars: 0,
  });

  const translations = useMemo(() => {
    const enFlat = flattenMessages(enMessages);
    const viFlat = flattenMessages(viMessages);

    const allKeys = new Set([...Object.keys(enFlat), ...Object.keys(viFlat)]);

    const result: FlatTranslation[] = [];

    for (const key of allKeys) {
      const enValue = enFlat[key] ?? null;
      const viValue = viFlat[key] ?? null;

      let status: FlatTranslation['status'] = 'complete';
      if (!viValue) status = 'missing-vi';
      else if (!enValue) status = 'missing-en';

      result.push({ key, enValue, viValue, status });
    }

    return result.sort((a, b) => a.key.localeCompare(b.key));
  }, [enMessages, viMessages]);

  // Extract namespaces from translation keys
  const namespaces = useMemo(() => {
    const ns = new Set<string>();
    for (const translation of translations) {
      const namespace = translation.key.split('.')[0];
      if (namespace) ns.add(namespace);
    }
    return Array.from(ns).sort();
  }, [translations]);

  const filteredTranslations = useMemo(() => {
    const filtered = translations.filter((translation) => {
      const matchesSearch =
        searchQuery === '' ||
        translation.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        translation.enValue
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        translation.viValue?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || translation.status === statusFilter;

      const matchesNamespace =
        namespaceFilter === 'all' ||
        translation.key.startsWith(`${namespaceFilter}.`);

      return matchesSearch && matchesStatus && matchesNamespace;
    });

    // Reset to page 1 when filters change
    setCurrentPage(1);
    return filtered;
  }, [translations, searchQuery, statusFilter, namespaceFilter]);

  const paginatedTranslations = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredTranslations.slice(startIndex, endIndex);
  }, [filteredTranslations, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredTranslations.length / pageSize);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(text);
      toast.success(`Copied ${label} to clipboard`);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }, []);

  // Export functions
  const exportToCSV = useCallback(() => {
    const headers = ['Key', 'English', 'Vietnamese', 'Status'];
    const rows = filteredTranslations.map((t) => [
      t.key,
      t.enValue || '',
      t.viValue || '',
      t.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `translations_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(
      `Exported ${filteredTranslations.length} translations to CSV`
    );
  }, [filteredTranslations]);

  const exportToJSON = useCallback(() => {
    const data = {
      exportDate: new Date().toISOString(),
      totalTranslations: filteredTranslations.length,
      filters: {
        search: searchQuery,
        namespace: namespaceFilter,
        status: statusFilter,
      },
      translations: filteredTranslations.map((t) => ({
        key: t.key,
        english: t.enValue,
        vietnamese: t.viValue,
        status: t.status,
        namespace: t.key.split('.')[0],
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `translations_${new Date().toISOString().split('T')[0]}.json`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(
      `Exported ${filteredTranslations.length} translations to JSON`
    );
  }, [filteredTranslations, searchQuery, namespaceFilter, statusFilter]);

  // Bulk actions
  const toggleSelectAll = useCallback(() => {
    if (selectedKeys.size === paginatedTranslations.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(paginatedTranslations.map((t) => t.key)));
    }
  }, [selectedKeys.size, paginatedTranslations]);

  const toggleSelectKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const exportSelectedToCSV = useCallback(() => {
    const selectedTranslations = filteredTranslations.filter((t) =>
      selectedKeys.has(t.key)
    );
    const headers = ['Key', 'English', 'Vietnamese', 'Status'];
    const rows = selectedTranslations.map((t) => [
      t.key,
      t.enValue || '',
      t.viValue || '',
      t.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `selected_translations_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(
      `Exported ${selectedTranslations.length} selected translations to CSV`
    );
  }, [filteredTranslations, selectedKeys]);

  const copySelectedKeys = useCallback(() => {
    const keys = Array.from(selectedKeys).join('\n');
    navigator.clipboard.writeText(keys).then(() => {
      toast.success(`Copied ${selectedKeys.size} keys to clipboard`);
    });
  }, [selectedKeys]);

  const generateAITranslations = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress('Analyzing translation structure...');
    setStreamingContent('');
    setTranslatedNamespaces([]);
    setParsedTranslations({});
    setStreamingStats({ totalKeys: 0, completedKeys: 0, totalChars: 0 });

    try {
      // Get top-level keys (namespaces)
      const topLevelKeys = Object.keys(enMessages);
      const chunks: Array<{ namespace: string; en: any; vi: any }> = [];

      // Split into chunks by namespace
      for (const key of topLevelKeys) {
        chunks.push({
          namespace: key,
          en: { [key]: enMessages[key] },
          vi: { [key]: viMessages?.[key] || {} },
        });
      }

      setTotalNamespaces(chunks.length);
      setGenerationProgress(`Processing ${chunks.length} namespaces...`);

      const translatedChunks: Record<string, any> = {};
      let completedChunks = 0;

      // Process each namespace separately with streaming
      for (const chunk of chunks) {
        setCurrentNamespace(chunk.namespace);
        setGenerationProgress(
          `Translating "${chunk.namespace}" (${completedChunks + 1}/${chunks.length})...`
        );
        setStreamingContent('');

        await new Promise<void>((resolve, reject) => {
          const response = fetch('/api/ai/translate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              enMessages: chunk.en,
              viMessages: chunk.vi,
            }),
          });

          response
            .then(async (res) => {
              if (!res.ok) {
                const error = await res.json().catch(() => ({
                  message: `Request failed with status ${res.status}`,
                }));
                reject(
                  new Error(
                    `Failed to translate "${chunk.namespace}": ${error.message || error.error || error.hint}`
                  )
                );
                return;
              }

              const reader = res.body?.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              if (!reader) {
                reject(new Error('No response body'));
                return;
              }

              while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));

                      if (data.type === 'chunk') {
                        setStreamingContent((prev) => {
                          const newContent = prev + data.content;

                          // Try to parse partial JSON to extract translations
                          try {
                            // Look for complete key-value pairs in the stream
                            const keyValueRegex = /"([^"]+)":\s*"([^"]*)"/g;
                            const matches = [
                              ...newContent.matchAll(keyValueRegex),
                            ];

                            if (matches.length > 0) {
                              const newParsed: Record<string, string> = {};
                              let totalChars = 0;

                              for (const match of matches) {
                                const key = match[1];
                                const value = match[2];
                                if (key && value) {
                                  newParsed[`${chunk.namespace}.${key}`] =
                                    value;
                                  totalChars += value.length;
                                }
                              }

                              setParsedTranslations(newParsed);
                              setStreamingStats({
                                totalKeys: Object.keys(newParsed).length,
                                completedKeys: Object.keys(newParsed).length,
                                totalChars,
                              });
                            }
                          } catch (_) {
                            // Parsing failed, continue streaming
                          }

                          return newContent;
                        });
                      } else if (data.type === 'complete') {
                        Object.assign(translatedChunks, data.translations);

                        // Update final parsed translations for this namespace
                        const flatTranslations = flattenMessages(
                          data.translations
                        );
                        setParsedTranslations((prev) => ({
                          ...prev,
                          ...flatTranslations,
                        }));

                        setTranslatedNamespaces((prev) => [
                          ...prev,
                          chunk.namespace,
                        ]);
                        resolve();
                      } else if (data.type === 'error') {
                        reject(new Error(data.message));
                      }
                    } catch (e) {
                      console.error('Failed to parse SSE message:', e);
                    }
                  }
                }
              }
            })
            .catch(reject);
        });

        completedChunks++;

        // Small delay between requests
        if (completedChunks < chunks.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      setGenerationProgress('Formatting translations...');

      // Format the translations as a JSON file and download
      const blob = new Blob([JSON.stringify(translatedChunks, null, 2)], {
        type: 'application/json',
      });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `vi_translated_${new Date().toISOString().split('T')[0]}.json`
      );
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        `AI translations generated successfully! Processed ${chunks.length} namespaces.`
      );
    } catch (error) {
      console.error('Translation generation error:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to generate translations'
      );
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
      setStreamingContent('');
      setCurrentNamespace('');
      setParsedTranslations({});
      setTotalNamespaces(0);
      setStreamingStats({ totalKeys: 0, completedKeys: 0, totalChars: 0 });
    }
  }, [enMessages, viMessages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
      }

      // Arrow keys for pagination (only when not in input)
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        if (e.key === 'ArrowLeft' && currentPage > 1) {
          e.preventDefault();
          setCurrentPage((p) => p - 1);
        } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
          e.preventDefault();
          setCurrentPage((p) => p + 1);
        }
      }

      // Escape to clear filters or close dialog
      if (e.key === 'Escape') {
        if (selectedTranslation) {
          e.preventDefault();
          setSelectedTranslation(null);
        } else if (
          searchQuery ||
          statusFilter !== 'all' ||
          namespaceFilter !== 'all'
        ) {
          e.preventDefault();
          setSearchQuery('');
          setStatusFilter('all');
          setNamespaceFilter('all');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    namespaceFilter,
    selectedTranslation,
  ]);

  const stats = useMemo(() => {
    const total = translations.length;
    const complete = translations.filter((t) => t.status === 'complete').length;
    const missingVi = translations.filter(
      (t) => t.status === 'missing-vi'
    ).length;
    const missingEn = translations.filter(
      (t) => t.status === 'missing-en'
    ).length;

    return { total, complete, missingVi, missingEn };
  }, [translations]);

  // Advanced analytics
  const analytics = useMemo(() => {
    const completionRate = (stats.complete / stats.total) * 100;

    // Average translation length
    const avgEnLength =
      translations
        .filter((t) => t.enValue)
        .reduce((sum, t) => sum + (t.enValue?.length || 0), 0) /
      translations.filter((t) => t.enValue).length;

    const avgViLength =
      translations
        .filter((t) => t.viValue)
        .reduce((sum, t) => sum + (t.viValue?.length || 0), 0) /
      translations.filter((t) => t.viValue).length;

    // Namespace breakdown
    const namespaceStats = namespaces.map((ns) => {
      const nsTranslations = translations.filter((t) =>
        t.key.startsWith(`${ns}.`)
      );
      const nsComplete = nsTranslations.filter(
        (t) => t.status === 'complete'
      ).length;
      return {
        namespace: ns,
        total: nsTranslations.length,
        complete: nsComplete,
        completion: (nsComplete / nsTranslations.length) * 100,
      };
    });

    // Most incomplete namespace
    const mostIncomplete = namespaceStats.reduce(
      (min, ns) => (ns.completion < min.completion ? ns : min),
      namespaceStats[0] || { namespace: 'N/A', completion: 100 }
    );

    return {
      completionRate,
      avgEnLength: Math.round(avgEnLength),
      avgViLength: Math.round(avgViLength),
      namespaceStats,
      mostIncomplete,
    };
  }, [translations, stats, namespaces]);

  const getStatusBadge = (status: FlatTranslation['status']) => {
    switch (status) {
      case 'complete':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green"
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Complete
          </Badge>
        );
      case 'missing-vi':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange"
          >
            <AlertCircle className="mr-1 h-3 w-3" />
            Missing VI
          </Badge>
        );
      case 'missing-en':
        return (
          <Badge
            variant="outline"
            className="border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red"
          >
            <XCircle className="mr-1 h-3 w-3" />
            Missing EN
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-bold text-3xl">Translation Management</h1>
          <p className="text-muted-foreground">
            View and compare English and Vietnamese translations
          </p>
        </div>
        <div className="flex gap-2">
          {/* AI Generation Button */}
          {canGenerateWithAI && (
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              onClick={generateAITranslations}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  AI Generate
                </>
              )}
            </Button>
          )}

          {/* Export Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-2">
                <h4 className="mb-3 font-semibold text-sm">Export Data</h4>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={exportToCSV}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Export as CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={exportToJSON}
                >
                  <FileJson className="h-4 w-4" />
                  Export as JSON
                </Button>
                <p className="border-t pt-2 text-muted-foreground text-xs">
                  {filteredTranslations.length} translations will be exported
                </p>
              </div>
            </PopoverContent>
          </Popover>

          {/* Analytics Dropdown */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-3 font-semibold text-sm">
                    Translation Insights
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Completion Rate
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-dynamic-green transition-all"
                            style={{ width: `${analytics.completionRate}%` }}
                          />
                        </div>
                        <span className="font-medium">
                          {analytics.completionRate.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Avg EN Length
                      </span>
                      <span className="font-medium">
                        {analytics.avgEnLength} chars
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Avg VI Length
                      </span>
                      <span className="font-medium">
                        {analytics.avgViLength} chars
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2 text-sm">
                      <span className="text-muted-foreground">
                        Most Incomplete
                      </span>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-dynamic-orange" />
                        <span className="font-medium text-xs">
                          {analytics.mostIncomplete.namespace} (
                          {analytics.mostIncomplete.completion.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h5 className="mb-2 font-semibold text-xs">Top Namespaces</h5>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {analytics.namespaceStats
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 5)
                      .map((ns) => (
                        <div
                          key={ns.namespace}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="max-w-[120px] truncate font-mono text-muted-foreground">
                            {ns.namespace}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {ns.complete}/{ns.total}
                            </span>
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-dynamic-blue transition-all"
                                style={{ width: `${ns.completion}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Keyboard Shortcuts */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Keyboard className="h-4 w-4" />
                Shortcuts
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 font-semibold">Keyboard Shortcuts</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Focus search
                      </span>
                      <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
                        ⌘K / Ctrl+K
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Previous page
                      </span>
                      <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
                        ←
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Next page</span>
                      <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
                        →
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Clear filters
                      </span>
                      <kbd className="rounded border bg-muted px-2 py-1 font-mono text-xs">
                        Esc
                      </kbd>
                    </div>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Total Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Complete</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.complete}</div>
            <p className="text-muted-foreground text-xs">
              {((stats.complete / stats.total) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Missing VI</CardTitle>
            <AlertCircle className="h-4 w-4 text-dynamic-orange" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.missingVi}</div>
            <p className="text-muted-foreground text-xs">
              {((stats.missingVi / stats.total) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Missing EN</CardTitle>
            <XCircle className="h-4 w-4 text-dynamic-red" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{stats.missingEn}</div>
            <p className="text-muted-foreground text-xs">
              {((stats.missingEn / stats.total) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card className="border-dynamic-blue/20 bg-dynamic-blue/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Completion</CardTitle>
            <Sparkles className="h-4 w-4 text-dynamic-blue" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {analytics.completionRate.toFixed(1)}%
            </div>
            <p className="text-muted-foreground text-xs">
              {stats.complete} of {stats.total} keys
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search translations by key or value..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by namespace" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              All Namespaces ({namespaces.length})
            </SelectItem>
            {namespaces.map((ns) => {
              const count = translations.filter((t) =>
                t.key.startsWith(`${ns}.`)
              ).length;
              return (
                <SelectItem key={ns} value={ns}>
                  {ns} ({count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({stats.total})</SelectItem>
            <SelectItem value="complete">
              Complete ({stats.complete})
            </SelectItem>
            <SelectItem value="missing-vi">
              Missing VI ({stats.missingVi})
            </SelectItem>
            <SelectItem value="missing-en">
              Missing EN ({stats.missingEn})
            </SelectItem>
          </SelectContent>
        </Select>
        {(searchQuery ||
          statusFilter !== 'all' ||
          namespaceFilter !== 'all') && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('all');
              setNamespaceFilter('all');
            }}
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedKeys.size > 0 && (
        <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-dynamic-blue" />
                <span className="font-semibold">
                  {selectedKeys.size} translation
                  {selectedKeys.size !== 1 ? 's' : ''} selected
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-8"
              >
                Clear selection
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copySelectedKeys}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy Keys
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportSelectedToCSV}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export Selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results count and page size selector */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-muted-foreground text-sm">
          Showing {(currentPage - 1) * pageSize + 1} to{' '}
          {Math.min(currentPage * pageSize, filteredTranslations.length)} of{' '}
          {filteredTranslations.length} translations
          {filteredTranslations.length !== translations.length && (
            <span className="text-muted-foreground/70">
              {' '}
              (filtered from {translations.length} total)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Translations Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={toggleSelectAll}
                >
                  {selectedKeys.size === paginatedTranslations.length &&
                  paginatedTranslations.length > 0 ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </TableHead>
              <TableHead className="w-[280px]">Key</TableHead>
              <TableHead>English</TableHead>
              <TableHead>Vietnamese</TableHead>
              <TableHead className="w-[140px]">Status</TableHead>
              <TableHead className="w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedTranslations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {filteredTranslations.length === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-sm">
                        No translations found matching your criteria.
                      </p>
                    </div>
                  ) : (
                    'No results on this page.'
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginatedTranslations.map((translation) => (
                <TableRow
                  key={translation.key}
                  className="group cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => setSelectedTranslation(translation)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => toggleSelectKey(translation.key)}
                    >
                      {selectedKeys.has(translation.key) ? (
                        <CheckSquare className="h-4 w-4 text-dynamic-blue" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={translation.key}>
                        {translation.key}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(translation.key, 'translation key');
                        }}
                      >
                        {copiedKey === translation.key ? (
                          <Check className="h-3 w-3 text-dynamic-green" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {translation.enValue ? (
                      <div className="group/cell flex items-center gap-2">
                        <div
                          className="max-w-md truncate"
                          title={translation.enValue}
                        >
                          {translation.enValue}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover/cell:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              translation.enValue!,
                              'English text'
                            );
                          }}
                        >
                          {copiedKey === translation.enValue ? (
                            <Check className="h-3 w-3 text-dynamic-green" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Missing
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {translation.viValue ? (
                      <div className="group/cell flex items-center gap-2">
                        <div
                          className="max-w-md truncate"
                          title={translation.viValue}
                        >
                          {translation.viValue}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 shrink-0 p-0 opacity-0 transition-opacity group-hover/cell:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(
                              translation.viValue!,
                              'Vietnamese text'
                            );
                          }}
                        >
                          {copiedKey === translation.viValue ? (
                            <Check className="h-3 w-3 text-dynamic-green" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Missing
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(translation.status)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          copyToClipboard(translation.key, 'translation key')
                        }
                        title="Copy key"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="h-8 w-8 p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* AI Generation Progress Dialog */}
      <Dialog open={isGenerating} onOpenChange={() => {}}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              AI Translation Generation
            </DialogTitle>
            <DialogDescription>
              Watch translations being generated in real-time with live insights
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            {/* Progress Overview */}
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
              <div className="mb-3 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-dynamic-blue" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{generationProgress}</p>
                  {currentNamespace && (
                    <p className="mt-1 text-muted-foreground text-xs">
                      Currently processing:{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono">
                        {currentNamespace}
                      </code>
                    </p>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {totalNamespaces > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Namespaces: {translatedNamespaces.length} /{' '}
                      {totalNamespaces}
                    </span>
                    <span className="font-medium">
                      {Math.round(
                        (translatedNamespaces.length / totalNamespaces) * 100
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-dynamic-blue transition-all duration-500"
                      style={{
                        width: `${(translatedNamespaces.length / totalNamespaces) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Statistics */}
            {streamingStats.totalKeys > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                <Card className="border-dynamic-green/20 bg-dynamic-green/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 font-medium text-sm">
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                      Keys Generated
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="font-bold text-2xl text-dynamic-green">
                      {streamingStats.completedKeys}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      translation keys
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-dynamic-blue/20 bg-dynamic-blue/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 font-medium text-sm">
                      <Sparkles className="h-4 w-4 text-dynamic-blue" />
                      Characters
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="font-bold text-2xl text-dynamic-blue">
                      {streamingStats.totalChars.toLocaleString()}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      total characters
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-dynamic-purple/20 bg-dynamic-purple/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 font-medium text-sm">
                      <TrendingUp className="h-4 w-4 text-dynamic-purple" />
                      Avg Length
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="font-bold text-2xl text-dynamic-purple">
                      {streamingStats.completedKeys > 0
                        ? Math.round(
                            streamingStats.totalChars /
                              streamingStats.completedKeys
                          )
                        : 0}
                    </div>
                    <p className="mt-1 text-muted-foreground text-xs">
                      chars per key
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Completed Namespaces */}
            {translatedNamespaces.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                  <h4 className="font-semibold text-sm">
                    Completed Namespaces ({translatedNamespaces.length})
                  </h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {translatedNamespaces.map((ns) => (
                    <Badge
                      key={ns}
                      variant="outline"
                      className="border-dynamic-green/20 bg-dynamic-green/10 font-mono text-dynamic-green text-xs"
                    >
                      {ns}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Live Generated Translations */}
            {Object.keys(parsedTranslations).length > 0 && (
              <div className="rounded-lg border bg-background p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-pulse text-dynamic-blue" />
                  <h4 className="font-semibold text-sm">
                    Live Generated Translations
                  </h4>
                  <Badge variant="outline" className="ml-auto">
                    {Object.keys(parsedTranslations).length} keys
                  </Badge>
                </div>
                <div className="max-h-[300px] space-y-2 overflow-y-auto">
                  {Object.entries(parsedTranslations)
                    .slice(-10) // Show last 10 translations
                    .reverse()
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="fade-in slide-in-from-bottom-2 animate-in space-y-1 rounded border bg-muted/30 p-2 text-xs duration-300"
                      >
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-muted-foreground text-xs">
                            {key}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-5 w-5 p-0"
                            onClick={() =>
                              copyToClipboard(value, 'translation')
                            }
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm">{value}</p>
                        <div className="flex items-center gap-2 pt-1 text-muted-foreground text-xs">
                          <span>{value.length} chars</span>
                        </div>
                      </div>
                    ))}
                </div>
                {Object.keys(parsedTranslations).length > 10 && (
                  <p className="mt-3 text-center text-muted-foreground text-xs">
                    Showing latest 10 of{' '}
                    {Object.keys(parsedTranslations).length} translations
                  </p>
                )}
              </div>
            )}

            {/* Raw Streaming Content */}
            {streamingContent && (
              <details className="rounded-lg border bg-muted/30">
                <summary className="flex cursor-pointer items-center gap-2 p-3 font-medium text-sm transition-colors hover:bg-muted/50">
                  <FileJson className="h-4 w-4" />
                  Raw AI Output ({streamingContent.length} chars)
                </summary>
                <div className="max-h-[200px] overflow-y-auto border-t p-3">
                  <pre className="wrap-break-word whitespace-pre-wrap font-mono text-xs">
                    {streamingContent}
                  </pre>
                </div>
              </details>
            )}

            {/* Info Box */}
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-3">
              <p className="space-y-1 text-muted-foreground text-xs">
                <strong className="block text-foreground">
                  Real-time Translation Process:
                </strong>
                <span className="block">
                  ✓ Each namespace is translated separately for accuracy
                </span>
                <span className="block">
                  ✓ Existing translations are preserved where possible
                </span>
                <span className="block">
                  ✓ Watch translations appear as AI generates them
                </span>
                <span className="block">
                  ✓ Complete file downloads automatically when finished
                </span>
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <Dialog
        open={!!selectedTranslation}
        onOpenChange={(open) => !open && setSelectedTranslation(null)}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-base">
                {selectedTranslation?.key}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedTranslation) {
                    copyToClipboard(selectedTranslation.key, 'translation key');
                  }
                }}
              >
                {copiedKey === selectedTranslation?.key ? (
                  <Check className="h-3 w-3 text-dynamic-green" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </DialogTitle>
            <DialogDescription>
              Compare English and Vietnamese translations side by side
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Status:</span>
              {selectedTranslation &&
                getStatusBadge(selectedTranslation.status)}
            </div>

            {/* Side by Side Comparison */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* English */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-semibold text-sm">
                    English
                    {selectedTranslation?.enValue && (
                      <span className="font-normal text-muted-foreground text-xs">
                        ({selectedTranslation.enValue.length} chars)
                      </span>
                    )}
                  </h4>
                  {selectedTranslation?.enValue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() =>
                        copyToClipboard(
                          selectedTranslation.enValue!,
                          'English text'
                        )
                      }
                    >
                      {copiedKey === selectedTranslation.enValue ? (
                        <Check className="h-3 w-3 text-dynamic-green" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
                <div className="max-h-[300px] min-h-[120px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
                  {selectedTranslation?.enValue ? (
                    <p className="wrap-break-word whitespace-pre-wrap">
                      {selectedTranslation.enValue}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      No English translation
                    </p>
                  )}
                </div>
              </div>

              {/* Vietnamese */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-semibold text-sm">
                    Vietnamese
                    {selectedTranslation?.viValue && (
                      <span className="font-normal text-muted-foreground text-xs">
                        ({selectedTranslation.viValue.length} chars)
                      </span>
                    )}
                  </h4>
                  {selectedTranslation?.viValue && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() =>
                        copyToClipboard(
                          selectedTranslation.viValue!,
                          'Vietnamese text'
                        )
                      }
                    >
                      {copiedKey === selectedTranslation.viValue ? (
                        <Check className="h-3 w-3 text-dynamic-green" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>
                <div className="max-h-[300px] min-h-[120px] overflow-y-auto rounded-lg border bg-muted/30 p-4">
                  {selectedTranslation?.viValue ? (
                    <p className="wrap-break-word whitespace-pre-wrap">
                      {selectedTranslation.viValue}
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      No Vietnamese translation
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Suggestions */}
            {selectedTranslation?.status !== 'complete' && (
              <div className="space-y-2 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-dynamic-orange" />
                  <h4 className="font-semibold text-sm">Suggestions</h4>
                </div>
                <div className="space-y-2 text-sm">
                  {!selectedTranslation?.enValue && (
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 text-dynamic-orange" />
                      <p className="text-muted-foreground">
                        Add English translation to maintain consistency across
                        languages
                      </p>
                    </div>
                  )}
                  {!selectedTranslation?.viValue && (
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 text-dynamic-orange" />
                      <p className="text-muted-foreground">
                        Add Vietnamese translation to complete this translation
                        pair
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <h4 className="mb-3 font-semibold text-sm">
                Translation Details
              </h4>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between border-b py-1">
                  <span className="text-muted-foreground">Namespace:</span>
                  <span className="font-mono text-xs">
                    {selectedTranslation?.key.split('.')[0]}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b py-1">
                  <span className="text-muted-foreground">Full Key:</span>
                  <span className="max-w-[300px] truncate font-mono text-xs">
                    {selectedTranslation?.key}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b py-1">
                  <span className="text-muted-foreground">
                    Character Difference:
                  </span>
                  <span className="font-mono text-xs">
                    {selectedTranslation?.enValue &&
                    selectedTranslation?.viValue
                      ? Math.abs(
                          selectedTranslation.enValue.length -
                            selectedTranslation.viValue.length
                        )
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">Has Both:</span>
                  <span>
                    {selectedTranslation?.status === 'complete' ? (
                      <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
                    ) : (
                      <XCircle className="h-4 w-4 text-dynamic-red" />
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
