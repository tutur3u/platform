'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  arePaginatedReportPagesEqual,
  normalizeReportText,
  type PaginatedReportBlock,
  type PaginatedReportPage,
  paginateReportBlocks,
  parseReportSegments,
  type ReportBlock,
  type ReportFlowSegment,
  type ReportSectionTone,
} from './report-preview-pagination';

const PAGE_HEIGHT_MM = 297;
const PAGE_WIDTH_MM = 210;
const SECTION_GAP_PX = 16;
const PAGE_BODY_SAFETY_PX = 6;

function getChunkContainerClass(tone: ReportSectionTone, isDark: boolean) {
  return cn(
    'rounded-[24px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]',
    tone === 'primary' &&
      (isDark
        ? 'border-cyan-400/15 bg-slate-900/70'
        : 'border-slate-200 bg-white/95'),
    tone === 'neutral' &&
      (isDark
        ? 'border-white/10 bg-slate-900/80'
        : 'border-slate-200 bg-slate-50/85'),
    tone === 'accent' &&
      (isDark
        ? 'border-cyan-400/20 bg-cyan-400/10'
        : 'border-cyan-200 bg-cyan-50/80')
  );
}

function getChunkHeadingClass(isDark: boolean) {
  return cn(
    'text-[11px] uppercase tracking-[0.26em]',
    isDark ? 'text-slate-400' : 'text-slate-500'
  );
}

const CHUNK_BODY_CLASS = 'mt-4 space-y-3 text-[15px] leading-7';

function renderSegment(segment: ReportFlowSegment) {
  if (segment.kind === 'spacer') {
    return <div key={segment.id} className="h-3" />;
  }

  if (segment.kind === 'bullet') {
    return (
      <div key={segment.id} className="flex items-start gap-3">
        <span className="mt-[0.45rem] block h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        <p className="min-w-0 whitespace-pre-wrap break-words">
          {segment.text}
        </p>
      </div>
    );
  }

  return (
    <p key={segment.id} className="whitespace-pre-wrap break-words">
      {segment.text}
    </p>
  );
}

function renderTextBlock(segments: ReportFlowSegment[], emptyLabel: string) {
  if (
    segments.length === 0 ||
    segments.every(
      (segment) => segment.kind === 'spacer' || !segment.text.trim()
    )
  ) {
    return <span className="opacity-55">{emptyLabel}</span>;
  }

  return segments.map(renderSegment);
}

function appendChunkMeasureContent(
  container: HTMLDivElement,
  segments: ReportFlowSegment[],
  emptyLabel: string
) {
  if (
    segments.length === 0 ||
    segments.every(
      (segment) => segment.kind === 'spacer' || !segment.text.trim()
    )
  ) {
    const placeholder = document.createElement('span');
    placeholder.className = 'opacity-55';
    placeholder.textContent = emptyLabel;
    container.appendChild(placeholder);
    return;
  }

  for (const segment of segments) {
    if (segment.kind === 'spacer') {
      const spacer = document.createElement('div');
      spacer.className = 'h-3';
      container.appendChild(spacer);
      continue;
    }

    if (segment.kind === 'bullet') {
      const row = document.createElement('div');
      row.className = 'flex items-start gap-3';

      const dot = document.createElement('span');
      dot.className =
        'mt-[0.45rem] block h-1.5 w-1.5 shrink-0 rounded-full bg-current';

      const textNode = document.createElement('p');
      textNode.className = 'min-w-0 whitespace-pre-wrap break-words';
      textNode.textContent = segment.text;

      row.append(dot, textNode);
      container.appendChild(row);
      continue;
    }

    const paragraph = document.createElement('p');
    paragraph.className = 'whitespace-pre-wrap break-words';
    paragraph.textContent = segment.text;
    container.appendChild(paragraph);
  }
}

function measureChunkHeight({
  blockKind,
  continuedLabel,
  emptyLabel,
  host,
  isDark,
  isContinuation,
  segments,
  title,
  tone,
}: {
  blockKind: 'atomic' | 'rich-text';
  continuedLabel: string;
  emptyLabel: string;
  host: HTMLDivElement;
  isDark: boolean;
  isContinuation: boolean;
  segments: ReportFlowSegment[];
  title: string;
  tone: ReportSectionTone;
}): number {
  host.replaceChildren();

  const section = document.createElement('section');
  section.className = getChunkContainerClass(tone, isDark);
  section.dataset.reportMeasureBlock = blockKind;

  const heading = document.createElement('div');
  heading.className = 'flex items-center justify-between gap-3';

  const headingText = document.createElement('div');
  headingText.className = getChunkHeadingClass(isDark);
  headingText.textContent = title;

  heading.appendChild(headingText);

  if (isContinuation) {
    const badge = document.createElement('div');
    badge.className = cn(
      'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]',
      isDark
        ? 'border-white/10 bg-white/5 text-slate-300'
        : 'border-slate-200 bg-white/80 text-slate-500'
    );
    badge.textContent = continuedLabel;
    heading.appendChild(badge);
  }

  const body = document.createElement('div');
  body.className = CHUNK_BODY_CLASS;
  appendChunkMeasureContent(body, segments, emptyLabel);

  section.append(heading, body);
  host.appendChild(section);

  return Math.ceil(section.getBoundingClientRect().height);
}

function buildPageShellClassName(isDark: boolean) {
  return cn(
    'relative box-border shrink-0 rounded-[28px] border shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)] print:rounded-none print:border-0 print:shadow-none',
    isDark
      ? 'border-slate-700/80 bg-slate-950 text-slate-100'
      : 'border-slate-200 bg-white text-slate-900'
  );
}

export default function ReportPreview({
  t,
  lang: _lang,
  data,
  parseDynamicText,
  getConfig,
  theme,
  notice,
  previewPageIndex = 0,
  singlePagePreview = false,
  onPaginationStateChange,
}: {
  lang: string;
  data?: {
    title: string;
    content: string;
    score: string;
    feedback: string;
  };
  t: any;
  parseDynamicText: (text?: string | null) => ReactNode;
  getConfig: (id: string) => string | null | undefined;
  theme?: 'light' | 'dark';
  notice?: ReactNode;
  previewPageIndex?: number;
  singlePagePreview?: boolean;
  onPaginationStateChange?: (state: {
    pageCount: number;
    ready: boolean;
  }) => void;
}) {
  const isDark = theme === 'dark';
  const brandLogo = getConfig('BRAND_LOGO_URL');
  const brandName = getConfig('BRAND_NAME');
  const brandLocation = getConfig('BRAND_LOCATION');
  const brandPhone = getConfig('BRAND_PHONE_NUMBER');
  const reportTitlePrefix = getConfig('REPORT_TITLE_PREFIX');
  const reportTitleSuffix = getConfig('REPORT_TITLE_SUFFIX');
  const reportIntro = getConfig('REPORT_INTRO');
  const reportContentTitle = getConfig('REPORT_CONTENT_TEXT');
  const reportScoreTitle = getConfig('REPORT_SCORE_TEXT');
  const reportFeedbackTitle = getConfig('REPORT_FEEDBACK_TEXT');
  const reportConclusion = getConfig('REPORT_CONCLUSION');
  const reportClosing = getConfig('REPORT_CLOSING');
  const hasReportIntro = Boolean(reportIntro?.trim());
  const reportDisplayTitle =
    data?.title?.trim() ||
    [reportTitlePrefix, reportTitleSuffix].filter(Boolean).join(' ').trim() ||
    t('common.untitled');
  const resolvedContentTitle =
    reportContentTitle?.trim() || t('ws-reports.report_overview_heading');
  const resolvedScoreTitle =
    reportScoreTitle?.trim() || t('ws-reports.representative_score');
  const resolvedFeedbackTitle =
    reportFeedbackTitle?.trim() || t('ws-reports.report_feedback_heading');
  const continuedLabel = t('ws-reports.continued');
  const emptyLabel = t('common.empty');
  const paginationUpdatingLabel = t('ws-reports.pagination_updating');

  const blocks = useMemo<ReportBlock[]>(
    () => [
      {
        key: 'content',
        kind: 'rich-text' as const,
        splittable: true as const,
        segments: parseReportSegments(
          normalizeReportText(data?.content),
          'report-content'
        ),
        title: resolvedContentTitle,
        tone: 'primary',
      },
      {
        key: 'feedback',
        kind: 'rich-text' as const,
        splittable: true as const,
        segments: parseReportSegments(
          normalizeReportText(data?.feedback),
          'report-feedback'
        ),
        title: resolvedFeedbackTitle,
        tone: 'neutral',
      },
      ...([reportConclusion, reportClosing].some(Boolean)
        ? [
            {
              key: 'closing',
              kind: 'rich-text' as const,
              splittable: true as const,
              segments: parseReportSegments(
                normalizeReportText(
                  [reportConclusion, reportClosing].filter(Boolean).join('\n\n')
                ),
                'report-closing'
              ),
              title: t('ws-reports.report_closing_heading'),
              tone: 'accent' as const,
            },
          ]
        : []),
    ],
    [
      data?.content,
      data?.feedback,
      reportConclusion,
      reportClosing,
      resolvedContentTitle,
      resolvedFeedbackTitle,
      t,
    ]
  );
  const [pages, setPages] = useState<PaginatedReportPage[]>([]);
  const [paginationReady, setPaginationReady] = useState(false);
  const firstPageFlowRef = useRef<HTMLDivElement>(null);
  const laterPageFlowRef = useRef<HTMLDivElement>(null);
  const chunkMeasureHostRef = useRef<HTMLDivElement>(null);

  const paginationSignature = [
    brandLogo,
    brandName,
    brandLocation,
    Boolean(brandPhone),
    Boolean(notice),
    data?.content,
    data?.feedback,
    data?.score,
    reportClosing,
    reportConclusion,
    reportDisplayTitle,
    reportIntro,
    paginationUpdatingLabel,
    resolvedContentTitle,
    resolvedFeedbackTitle,
    resolvedScoreTitle,
    theme,
  ].join('::');

  useLayoutEffect(() => {
    void paginationSignature;
    setPaginationReady(false);

    let cancelled = false;
    let firstFrame = 0;
    let secondFrame = 0;

    const measurePages = () => {
      const firstPageHeight = firstPageFlowRef.current?.clientHeight ?? 0;
      const laterPageHeight = laterPageFlowRef.current?.clientHeight ?? 0;
      const host = chunkMeasureHostRef.current;

      if (!host || firstPageHeight === 0 || laterPageHeight === 0) {
        return;
      }

      const measuredPages = paginateReportBlocks({
        blocks,
        firstPageHeight: Math.max(1, firstPageHeight - PAGE_BODY_SAFETY_PX),
        laterPageHeight: Math.max(1, laterPageHeight - PAGE_BODY_SAFETY_PX),
        measureBlock: ({ block, isContinuation, segments }) =>
          measureChunkHeight({
            blockKind: block.kind,
            continuedLabel,
            emptyLabel,
            host,
            isDark,
            isContinuation,
            segments,
            title: block.title,
            tone: block.tone,
          }),
        pageGap: SECTION_GAP_PX,
      });

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setPages((currentPages) =>
          arePaginatedReportPagesEqual(currentPages, measuredPages)
            ? currentPages
            : measuredPages
        );
        setPaginationReady(true);
      });
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(measurePages);
      });
    };

    scheduleMeasure();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });

      if (firstPageFlowRef.current) {
        resizeObserver.observe(firstPageFlowRef.current);
      }
      if (laterPageFlowRef.current) {
        resizeObserver.observe(laterPageFlowRef.current);
      }
    }

    if (typeof document !== 'undefined' && 'fonts' in document) {
      void (document.fonts as FontFaceSet).ready.then(() => {
        if (!cancelled) {
          scheduleMeasure();
        }
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      resizeObserver?.disconnect();
    };
  }, [blocks, continuedLabel, emptyLabel, isDark, paginationSignature]);

  useLayoutEffect(() => {
    onPaginationStateChange?.({
      pageCount: Math.max(1, pages.length),
      ready: paginationReady,
    });
  }, [onPaginationStateChange, pages.length, paginationReady]);

  const totalPages = Math.max(1, pages.length);
  const clampedPreviewPageIndex = Math.min(
    Math.max(previewPageIndex, 0),
    Math.max(totalPages - 1, 0)
  );

  const renderPageShell = ({
    body,
    includePageData = true,
    pageIndex,
    totalPages: pageCount,
    flowRef,
  }: {
    body: ReactNode;
    includePageData?: boolean;
    pageIndex: number;
    totalPages: number;
    flowRef?: { current: HTMLDivElement | null };
  }) => (
    <article
      key={`report-page-${pageIndex + 1}-${includePageData ? 'render' : 'measure'}`}
      {...(includePageData ? { 'data-report-page': true } : {})}
      className={buildPageShellClassName(isDark)}
      style={{
        height: `${PAGE_HEIGHT_MM}mm`,
        minHeight: `${PAGE_HEIGHT_MM}mm`,
        minWidth: `${PAGE_WIDTH_MM}mm`,
        width: `${PAGE_WIDTH_MM}mm`,
      }}
    >
      <div className="relative flex h-full flex-col px-7 py-7 md:px-10 md:py-9 print:px-[14mm] print:py-[14mm]">
        <header
          className={cn(
            'flex items-start justify-between gap-4 border-b pb-5 md:gap-6',
            isDark ? 'border-white/10' : 'border-slate-200'
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div className="flex min-w-0 items-start">
              {brandLogo ? (
                /* biome-ignore lint/performance/noImgElement: configured external brand logos are runtime URLs */
                <img
                  src={brandLogo}
                  alt="logo"
                  className="max-h-12 w-auto max-w-[120px] shrink-0 object-contain md:max-h-14 md:max-w-[150px]"
                />
              ) : (
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-2xl border font-semibold text-sm uppercase',
                    isDark
                      ? 'border-white/10 bg-white/5 text-slate-200'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  )}
                >
                  {t('ws-reports.report').slice(0, 1)}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-2 pt-0.5">
              <div
                className={cn(
                  'text-[11px] uppercase tracking-[0.28em]',
                  isDark ? 'text-cyan-200/70' : 'text-cyan-700'
                )}
              >
                {brandName || t('ws-reports.report')}
              </div>

              {brandLocation ? (
                <p
                  className={cn(
                    'max-w-[42ch] whitespace-pre-line text-sm leading-6',
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  )}
                >
                  {brandLocation}
                </p>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 space-y-3 text-right">
            {brandPhone ? (
              <div className="font-semibold text-[13px] uppercase tracking-[0.16em]">
                {brandPhone}
              </div>
            ) : null}
            <div
              className={cn(
                'inline-flex rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.28em]',
                isDark
                  ? 'border-white/10 bg-white/5 text-slate-300'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              )}
            >
              {String(pageIndex + 1).padStart(2, '0')} /{' '}
              {String(pageCount).padStart(2, '0')}
            </div>
          </div>
        </header>

        {pageIndex === 0 ? (
          <div className="space-y-5 pt-6">
            <div className="space-y-3 text-center">
              <div
                className={cn(
                  'text-[11px] uppercase tracking-[0.32em]',
                  isDark ? 'text-slate-400' : 'text-slate-500'
                )}
              >
                {brandName || t('ws-reports.report')}
              </div>
              <h1 className="text-balance font-semibold text-[28px] uppercase leading-tight md:text-[32px]">
                {reportDisplayTitle}
              </h1>
            </div>

            {notice ? <div className="print:hidden">{notice}</div> : null}

            {hasReportIntro ? (
              <section
                className={cn(
                  'rounded-[26px] border px-5 py-5',
                  isDark
                    ? 'border-white/10 bg-white/[0.045]'
                    : 'border-slate-200 bg-slate-50/90'
                )}
              >
                <div
                  className={cn(
                    'text-[11px] uppercase tracking-[0.28em]',
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  )}
                >
                  {brandName || t('ws-reports.report')}
                </div>
                <div className="mt-3 text-left text-[15px] leading-8">
                  {parseDynamicText(reportIntro)}
                </div>
              </section>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div
                className={cn(
                  'rounded-[24px] border px-5 py-4',
                  isDark
                    ? 'border-cyan-400/20 bg-cyan-400/10'
                    : 'border-cyan-200 bg-cyan-50/90'
                )}
              >
                <div
                  className={cn(
                    'text-[11px] uppercase tracking-[0.26em]',
                    isDark ? 'text-cyan-100/80' : 'text-cyan-700'
                  )}
                >
                  {resolvedContentTitle}
                </div>
                <p className="mt-3 max-w-[56ch] text-sm leading-7">
                  {t('ws-reports.report_overview_description')}
                </p>
              </div>

              <div
                className={cn(
                  'rounded-[24px] border px-5 py-4',
                  isDark
                    ? 'border-amber-300/20 bg-amber-300/10'
                    : 'border-amber-200 bg-amber-50/90'
                )}
              >
                <div
                  className={cn(
                    'text-[11px] uppercase tracking-[0.26em]',
                    isDark ? 'text-amber-100/80' : 'text-amber-700'
                  )}
                >
                  {resolvedScoreTitle}
                </div>
                <div className="mt-3 font-semibold text-[34px] tabular-nums leading-none">
                  {data?.score || '-'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'pt-6 text-[11px] uppercase tracking-[0.28em]',
              isDark ? 'text-slate-400' : 'text-slate-500'
            )}
          >
            {reportDisplayTitle}
          </div>
        )}

        <div ref={flowRef} className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
          {body}
        </div>

        <footer
          className={cn(
            'mt-6 flex items-center justify-between border-t pt-4 text-[11px]',
            isDark
              ? 'border-white/10 text-slate-400'
              : 'border-slate-200 text-slate-500'
          )}
        >
          <div className="uppercase tracking-[0.2em]">
            {brandName || t('ws-reports.report')}
          </div>
          <div className="uppercase tracking-[0.2em]">
            {String(pageIndex + 1).padStart(2, '0')} /{' '}
            {String(pageCount).padStart(2, '0')}
          </div>
        </footer>
      </div>
    </article>
  );

  const renderBlock = (block: PaginatedReportBlock) => (
    <section
      key={block.key}
      className={getChunkContainerClass(block.tone, isDark)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className={getChunkHeadingClass(isDark)}>{block.title}</div>
        {block.isContinuation ? (
          <div
            className={cn(
              'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]',
              isDark
                ? 'border-white/10 bg-white/5 text-slate-300'
                : 'border-slate-200 bg-white/80 text-slate-500'
            )}
          >
            {continuedLabel}
          </div>
        ) : null}
      </div>
      <div className={CHUNK_BODY_CLASS}>
        {renderTextBlock(block.segments, emptyLabel)}
      </div>
    </section>
  );

  const renderPage = (page: PaginatedReportPage, pageIndex: number) =>
    renderPageShell({
      body: page.blocks.map(renderBlock),
      pageIndex,
      totalPages,
    });

  const renderLoadingPage = () =>
    renderPageShell({
      body: (
        <section className={getChunkContainerClass('neutral', isDark)}>
          <div className="flex items-center justify-between gap-3">
            <div className={getChunkHeadingClass(isDark)}>
              {t('ws-reports.report')}
            </div>
            <div
              className={cn(
                'rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em]',
                isDark
                  ? 'border-white/10 bg-white/5 text-slate-300'
                  : 'border-slate-200 bg-white/80 text-slate-500'
              )}
            >
              {paginationUpdatingLabel}
            </div>
          </div>
          <div
            className={cn(
              CHUNK_BODY_CLASS,
              isDark ? 'text-slate-300' : 'text-slate-600'
            )}
          >
            <p>{t('ws-reports.preview_pages_description')}</p>
          </div>
        </section>
      ),
      pageIndex: 0,
      totalPages: 1,
    });

  const visiblePreviewPage =
    paginationReady && pages.length > 0
      ? renderPage(
          pages[clampedPreviewPageIndex] ?? pages[0] ?? { blocks: [] },
          clampedPreviewPageIndex
        )
      : renderLoadingPage();

  return (
    <div className="overflow-x-auto xl:flex-none">
      <div
        className="pointer-events-none fixed top-0 -left-[99999px] z-[-1]"
        aria-hidden
      >
        <div className="mx-auto flex w-[210mm] min-w-[210mm] flex-col gap-6">
          {renderPageShell({
            body: null,
            includePageData: false,
            pageIndex: 0,
            totalPages: 2,
            flowRef: firstPageFlowRef,
          })}
          {renderPageShell({
            body: <div ref={chunkMeasureHostRef} />,
            includePageData: false,
            pageIndex: 1,
            totalPages: 2,
            flowRef: laterPageFlowRef,
          })}
        </div>
      </div>

      {singlePagePreview ? (
        <>
          <div className="mx-auto flex w-[210mm] min-w-[210mm] flex-col gap-6 print:hidden">
            {visiblePreviewPage}
          </div>
          {paginationReady ? (
            <div className="pointer-events-none fixed top-0 -left-[99999px] z-[-1]">
              <div
                id="printable-area"
                data-report-export-stack
                className="mx-auto flex w-[210mm] min-w-[210mm] flex-col gap-6"
              >
                {pages.map((page, pageIndex) => renderPage(page, pageIndex))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div
          id="printable-area"
          data-report-export-stack
          className="mx-auto flex w-[210mm] min-w-[210mm] flex-col gap-6 print:max-w-none print:gap-0"
        >
          {paginationReady
            ? pages.map((page, pageIndex) => renderPage(page, pageIndex))
            : [renderLoadingPage()]}
        </div>
      )}
    </div>
  );
}
