'use client';

import { ExternalLink, Globe, Search } from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import type { GoogleSearchVisualization } from '../../types/visualizations';

interface GoogleSearchCardProps {
  data: GoogleSearchVisualization['data'];
}

export function GoogleSearchCard({ data }: GoogleSearchCardProps) {
  const { query, results, totalResults } = data;

  return (
    <Card className="overflow-hidden border-border/50 bg-linear-to-b from-card to-card/95 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="border-border/30 border-b bg-dynamic-blue/10 px-4 py-3 pr-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-dynamic-blue/15">
            <Search className="h-4 w-4 text-dynamic-blue" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm">Google Search</h3>
            <p className="truncate text-muted-foreground text-xs">"{query}"</p>
          </div>
          {totalResults !== undefined && (
            <span className="text-muted-foreground text-xs">
              {totalResults} source{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Results List */}
      <div className="max-h-72 divide-y divide-border/20 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted-foreground">
            <Globe className="h-8 w-8 opacity-50" />
            <span className="text-sm">No results found</span>
          </div>
        ) : (
          results.map((result, index) => (
            <a
              key={index}
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-2 px-4 py-3 transition-all duration-200 hover:bg-muted/40"
            >
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-blue" />
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 font-medium text-dynamic-blue text-sm group-hover:underline">
                  {result.title}
                </span>
                <span className="block truncate text-muted-foreground/70 text-xs">
                  {(() => {
                    try {
                      return new URL(result.url).hostname;
                    } catch {
                      return result.url;
                    }
                  })()}
                </span>
              </div>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          ))
        )}
      </div>
    </Card>
  );
}
