import { ChevronRight, ExternalLink, Globe } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export function SourcesPart({
  parts,
}: {
  parts: Array<{ url: string; title?: string; sourceId: string }>;
}) {
  const t = useTranslations('dashboard.mira_chat');
  const [expanded, setExpanded] = useState(false);
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return parts.filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  }, [parts]);

  if (unique.length === 0) return null;

  const Header = unique.length > 3 ? 'button' : 'div';
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <Header
        type={unique.length > 3 ? 'button' : undefined}
        onClick={unique.length > 3 ? () => setExpanded((e) => !e) : undefined}
        aria-expanded={unique.length > 3 ? expanded : undefined}
        className="flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
      >
        <Globe className="h-3 w-3 text-dynamic-cyan" />
        <span className="font-medium">
          {t('sources_count', { count: unique.length })}
        </span>
        {unique.length > 3 && (
          <>
            <span>
              {t(expanded ? 'sources_show_less' : 'sources_show_all')}
            </span>
            <ChevronRight
              className={cn(
                'ml-0.5 h-3 w-3 transition-transform',
                expanded && 'rotate-90'
              )}
            />
          </>
        )}
      </Header>
      {
        <div className="flex flex-wrap gap-1.5">
          {(expanded ? unique : unique.slice(0, 3)).map((src, i) => {
            const hostname = (() => {
              try {
                return new URL(src.url).hostname.replace(/^www\./, '');
              } catch {
                return src.url;
              }
            })();
            return (
              <a
                key={`${src.sourceId ?? i}-${i}`}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/5 px-2 py-1 text-[11px] text-dynamic-cyan transition-colors hover:border-dynamic-cyan/40 hover:bg-dynamic-cyan/10"
                title={src.title || src.url}
              >
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-dynamic-cyan/15 font-bold font-mono text-[9px]">
                  {i + 1}
                </span>
                <span className="max-w-32 truncate">
                  {src.title || hostname}
                </span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-50" />
              </a>
            );
          })}
        </div>
      }
    </div>
  );
}
