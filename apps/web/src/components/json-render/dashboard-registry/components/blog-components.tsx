import type {
  JsonRenderArticleHeaderProps,
  JsonRenderComponentContext,
  JsonRenderInsightSectionProps,
  JsonRenderKeyPointsProps,
  JsonRenderSourceListProps,
} from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { Streamdown } from 'streamdown';
import { type IconComponent, resolveRegistryIcon } from './base-core-icon';

const markdownSyntaxPattern =
  /(\*\*|__|`|~~|\[.+\]\(.+\)|^#{1,6}\s|^\s*[-*+]\s|^\s*\d+\.\s)/m;

function parseSafeHttpUrl(value?: string): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, '');
}

function isUrlLike(value?: string): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const start = value.slice(0, Math.max(8, Math.floor(maxLength / 2) - 2));
  const end = value.slice(-Math.max(8, Math.floor(maxLength / 2) - 2));
  return `${start}...${end}`;
}

function MarkdownText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!markdownSyntaxPattern.test(text)) {
    return <span className={className}>{text}</span>;
  }

  return (
    <div className={cn('[&_ol]:m-0 [&_p]:m-0 [&_ul]:m-0', className)}>
      <Streamdown
        isAnimating={false}
        controls={{
          code: false,
          mermaid: false,
        }}
        linkSafety={{ enabled: true }}
      >
        {text}
      </Streamdown>
    </div>
  );
}

function getSourceDisplayModel(source: {
  title: string;
  url: string;
  publisher?: string;
  note?: string;
}) {
  const parsed = parseSafeHttpUrl(source.url);
  const host = parsed ? normalizeHost(parsed.hostname) : 'source';
  const isGoogleGrounding =
    host === 'vertexaisearch.cloud.google.com' &&
    parsed?.pathname.includes('/grounding-api-redirect');

  const safeTitle =
    source.title && !isUrlLike(source.title)
      ? source.title
      : source.publisher && !isUrlLike(source.publisher)
        ? source.publisher
        : isGoogleGrounding
          ? 'Web result'
          : host;

  const publisher =
    source.publisher && !isUrlLike(source.publisher) ? source.publisher : null;
  const note = source.note && !isUrlLike(source.note) ? source.note : null;
  const meta = [publisher, note].filter(Boolean).join(' - ');

  const path =
    parsed?.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
  const urlPreview = parsed ? `${host}${path}` : source.url;

  return {
    title: safeTitle,
    host: isGoogleGrounding ? 'google grounding' : host,
    meta,
    urlPreview: truncateMiddle(urlPreview, 52),
  };
}

function SourceListItem({
  source,
  showUrl,
  ExternalLinkIcon,
  LinkIcon,
}: {
  source: JsonRenderSourceListProps['sources'][number];
  showUrl: boolean;
  ExternalLinkIcon: IconComponent | null;
  LinkIcon: IconComponent | null;
}) {
  const display = getSourceDisplayModel(source);
  const safeHref = parseSafeHttpUrl(source.url)?.toString() ?? null;
  const itemClassName =
    'group rounded-lg border border-border/40 bg-muted/5 px-2.5 py-2 text-left transition-colors hover:border-primary/30 hover:bg-muted/15';
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[12px] text-foreground">
            {display.title}
          </div>
          {display.meta ? (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {display.meta}
            </div>
          ) : (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {display.host}
            </div>
          )}
        </div>
        {ExternalLinkIcon && safeHref && (
          <ExternalLinkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/75 transition-colors group-hover:text-primary" />
        )}
      </div>

      {showUrl && (
        <div className="mt-1.5 inline-flex min-w-0 items-center gap-1 text-[10px] text-dynamic-blue">
          {LinkIcon && <LinkIcon className="h-3 w-3 shrink-0" />}
          <span className="truncate font-mono">{display.urlPreview}</span>
        </div>
      )}
    </>
  );

  if (!safeHref) {
    return <div className={itemClassName}>{content}</div>;
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer noopener"
      title={safeHref}
      className={itemClassName}
    >
      {content}
    </a>
  );
}

export const blogDashboardComponents = {
  ArticleHeader: ({
    props,
  }: JsonRenderComponentContext<JsonRenderArticleHeaderProps>) => {
    return (
      <div className="mb-1 flex flex-col gap-2 text-left">
        {props.eyebrow && (
          <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
            {props.eyebrow}
          </span>
        )}
        <h2 className="whitespace-pre-wrap break-words font-semibold text-[30px] leading-tight tracking-tight">
          {props.title}
        </h2>
        {props.subtitle && (
          <p className="whitespace-pre-wrap break-words text-[15px] text-muted-foreground leading-relaxed">
            {props.subtitle}
          </p>
        )}
        {(props.byline || props.publishedAt || props.readingTime) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            {props.byline && (
              <span className="font-medium">{props.byline}</span>
            )}
            {props.publishedAt && <span>{props.publishedAt}</span>}
            {props.readingTime && (
              <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5">
                {props.readingTime}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
  InsightSection: ({
    props,
    children,
  }: JsonRenderComponentContext<JsonRenderInsightSectionProps>) => {
    const toneClasses: Record<
      NonNullable<JsonRenderInsightSectionProps['tone']>,
      string
    > = {
      neutral: 'border-border/50',
      positive: 'border-dynamic-green/30',
      warning: 'border-dynamic-yellow/35',
      critical: 'border-dynamic-red/35',
    };
    const tone = props.tone ?? 'neutral';

    return (
      <section
        className={cn(
          'rounded-xl border bg-card/70 px-5 py-4 shadow-sm backdrop-blur-sm',
          toneClasses[tone]
        )}
      >
        <header className="mb-3 flex flex-col gap-1">
          <h3 className="whitespace-pre-wrap break-words font-semibold text-[18px] leading-tight tracking-tight">
            {props.title}
          </h3>
          {props.summary && (
            <MarkdownText
              text={props.summary}
              className="whitespace-pre-wrap break-words text-[13px] text-muted-foreground leading-relaxed"
            />
          )}
        </header>
        <div className="flex flex-col gap-3 text-[14px] leading-relaxed">
          {children}
        </div>
      </section>
    );
  },
  KeyPoints: ({
    props,
  }: JsonRenderComponentContext<JsonRenderKeyPointsProps>) => {
    const points = Array.isArray(props.points)
      ? props.points.filter(
          (point): point is string =>
            typeof point === 'string' && point.trim().length > 0
        )
      : [];
    if (points.length === 0) return null;

    const ListTag = props.ordered ? 'ol' : 'ul';
    return (
      <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
        {props.title && (
          <MarkdownText
            text={props.title}
            className="mb-2 font-medium text-[13px] text-muted-foreground uppercase tracking-wider"
          />
        )}
        <ListTag
          className={cn(
            'space-y-1.5 pl-5 text-[14px] text-foreground/90 leading-relaxed',
            !props.ordered && 'list-disc',
            props.ordered && 'list-decimal'
          )}
        >
          {points.map((point, index) => (
            <li key={`${point.slice(0, 24)}-${index}`} className="break-words">
              <MarkdownText text={point} />
            </li>
          ))}
        </ListTag>
      </div>
    );
  },
  SourceList: ({
    props,
  }: JsonRenderComponentContext<JsonRenderSourceListProps>) => {
    const sources = Array.isArray(props.sources) ? props.sources : [];
    if (sources.length === 0) return null;

    const showUrl = props.showUrl ?? false;
    const compact = props.compact ?? true;
    const ExternalLinkIcon = resolveRegistryIcon('ExternalLink');
    const LinkIcon = resolveRegistryIcon('Link2');

    return (
      <div className="rounded-xl border border-border/40 bg-card/60 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="font-medium text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
            {props.title ?? 'Sources'}
          </div>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {sources.length}
          </Badge>
        </div>
        <div
          className={cn(
            'grid gap-2',
            compact ? 'sm:grid-cols-2' : 'grid-cols-1'
          )}
        >
          {sources.map((source, index) => (
            <SourceListItem
              key={`${source.url}-${index}`}
              source={source}
              showUrl={showUrl}
              ExternalLinkIcon={ExternalLinkIcon}
              LinkIcon={LinkIcon}
            />
          ))}
        </div>
      </div>
    );
  },
};
