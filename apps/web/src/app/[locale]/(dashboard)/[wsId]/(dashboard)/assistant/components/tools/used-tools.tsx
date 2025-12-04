'use client';

import { BarChart3, Search, Sparkles, Wand2 } from '@tuturuuu/icons';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';

type UsedTool = {
  name: string;
  count: number;
  lastUsedAt: number;
  recent?: Array<{ args: Record<string, any>; at: number }>;
};

// Types are now imported from the prediction hook

const iconForTool = (name: string) => {
  if (name === 'googleSearch') return Search;
  if (name === 'render_altair') return BarChart3;
  if (name.startsWith('fetch_')) return Sparkles;
  if (name.startsWith('get_') || name.startsWith('list_')) return Sparkles;
  return Wand2;
};

const prettyLabel = (name: string) => {
  if (name === 'googleSearch') return 'Google Search';
  if (name === 'render_altair') return 'Altair Chart';
  return name.replaceAll('_', ' ');
};

const conciseArgs = (
  name: string,
  args?: Record<string, any>
): string | null => {
  if (!args) return null;
  if (name === 'fetch_prediction' && typeof args.ticker === 'string') {
    return `Ticker: ${args.ticker}`;
  }
  if (name === 'fetch_portfolio' && args.portfolioId) {
    return `Portfolio: ${String(args.portfolioId).slice(0, 10)}`;
  }
  if (name === 'fetch_portfolio_stocks' && args.portfolioId) {
    return `Stocks for: ${String(args.portfolioId).slice(0, 10)}`;
  }
  if (name === 'fetch_companies_for_portfolio') {
    const pid = args.portfolioId
      ? String(args.portfolioId).slice(0, 10)
      : 'unknown';
    const lim = typeof args.limit === 'number' ? ` • Limit: ${args.limit}` : '';
    return `Portfolio: ${pid}${lim}`;
  }
  if (name === 'render_altair' && typeof args.json_graph === 'string') {
    const len = args.json_graph.length;
    return `Chart spec • ${len.toLocaleString()} chars`;
  }
  return null;
};

// Aggregate recent contexts for a friendlier, combined subtitle (e.g., multiple tickers)
const combinedConciseArgs = (
  name: string,
  recent?: Array<{ args: Record<string, any>; at: number }>
): string | null => {
  if (!recent || recent.length === 0) return null;

  if (name === 'googleSearch') {
    const queries = Array.from(
      new Set(
        recent
          .map((r) => {
            const a = r.args ?? {};
            // Common param aliases we might receive
            return (
              (typeof a.query === 'string' && a.query) ||
              (typeof a.q === 'string' && a.q) ||
              (typeof a.term === 'string' && a.term) ||
              null
            );
          })
          .filter((q): q is string => Boolean(q))
      )
    );
    if (queries.length === 0) return null;
    const label = queries.length > 1 ? 'Queries' : 'Query';
    return `${label}: ${queries.join(', ')}`;
  }

  if (name === 'fetch_prediction') {
    const tickers = Array.from(
      new Set(
        recent
          .map((r) =>
            typeof r.args?.ticker === 'string' ? r.args.ticker : null
          )
          .filter((t): t is string => Boolean(t))
      )
    );
    if (tickers.length === 0) return null;
    const label = tickers.length > 1 ? 'Tickers' : 'Ticker';
    return `${label}: ${tickers.join(', ')}`;
  }

  // Default to most recent single concise arg for tools without custom aggregation
  return conciseArgs(name, recent[0]?.args);
};

// Return unique recent queries for googleSearch
const getRecentQueries = (
  name: string,
  recent?: Array<{ args: Record<string, any>; at: number }>
): string[] => {
  if (name !== 'googleSearch' || !recent) return [];
  return Array.from(
    new Set(
      recent
        .map((r) => {
          const a = r.args ?? {};
          return (
            (typeof a.query === 'string' && a.query) ||
            (typeof a.q === 'string' && a.q) ||
            (typeof a.term === 'string' && a.term) ||
            null
          );
        })
        .filter((q): q is string => Boolean(q))
    )
  );
};

export default function UsedTools() {
  const { client, connected } = useLiveAPIContext();
  const [tools, setTools] = useState<Record<string, UsedTool>>({});
  // Predictions are derived via React Query; no local loading state needed

  useEffect(() => {
    if (!client) return;
    const onToolCall = (toolCall: any) => {
      const now = Date.now();
      setTools((prev) => {
        const next = { ...prev };
        const calls: Array<{ name: string; args: Record<string, any> }> =
          toolCall.functionCalls.map((fc: any) => ({
            name: fc.name,
            args: fc.args,
          }));
        calls.forEach(({ name, args }) => {
          const prevEntry = next[name];
          next[name] = {
            name,
            count: (prevEntry?.count ?? 0) + 1,
            lastUsedAt: now,
            recent: [{ args, at: now }, ...(prevEntry?.recent ?? [])],
          };
        });
        return next;
      });
    };

    client.on('toolcall', onToolCall);
    return () => {
      client.off('toolcall', onToolCall);
    };
  }, [client]);

  // Clear tools when the chat disconnects
  useEffect(() => {
    if (!connected) {
      setTools({});
    }
  }, [connected]);

  const sorted = useMemo(() => {
    return Object.values(tools).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }, [tools]);

  if (!sorted.length) return null;

  return (
    <TooltipProvider>
      <div className="mb-8 flex w-full items-center justify-center gap-2">
        <ul
          className={cn(
            'relative flex items-center justify-center gap-2 overflow-x-auto py-1 pr-2',
            'no-scrollbar'
          )}
          aria-live="polite"
        >
          <AnimatePresence initial={false}>
            {sorted.map((t) => {
              const Icon = iconForTool(t.name);
              const isHot = Date.now() - t.lastUsedAt < 3000;
              const label = prettyLabel(t.name);
              const subtitle = combinedConciseArgs(t.name, t.recent);
              const queries = getRecentQueries(t.name, t.recent);
              const extraQueryCount = Math.max(0, queries.length - 6);
              return (
                <Tooltip key={t.name}>
                  <TooltipTrigger asChild>
                    <motion.li
                      layout
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.96 }}
                      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs'
                      )}
                      tabIndex={0}
                    >
                      <Icon
                        className={cn('h-3.5 w-3.5', isHot && 'animate-pulse')}
                        aria-hidden
                      />
                      <div className="grid max-w-[16rem] gap-1 overflow-hidden">
                        <span className="font-medium text-foreground/90">
                          {label}
                        </span>
                        {t.name === 'googleSearch' && queries.length > 0 ? (
                          <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
                            {queries.slice(0, 6).map((q) => (
                              <span
                                key={q}
                                className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                title={q}
                              >
                                {q.length > 18 ? `${q.slice(0, 18)}…` : q}
                              </span>
                            ))}
                            {extraQueryCount > 0 && (
                              <span className="rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                +{extraQueryCount}
                              </span>
                            )}
                          </span>
                        ) : (
                          subtitle && (
                            <span className="ml-1 text-[10px] text-muted-foreground/90">
                              • {subtitle}
                            </span>
                          )
                        )}
                      </div>
                    </motion.li>
                  </TooltipTrigger>
                </Tooltip>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    </TooltipProvider>
  );
}
