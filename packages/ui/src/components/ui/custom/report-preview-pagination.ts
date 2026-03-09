export type ReportSectionTone = 'primary' | 'neutral' | 'accent';
export type ReportFlowSegmentKind = 'paragraph' | 'bullet' | 'spacer';
export type ReportBlockKind = 'rich-text' | 'atomic';

export interface ReportFlowSegment {
  id: string;
  kind: ReportFlowSegmentKind;
  text: string;
}

interface BaseReportBlock {
  key: string;
  kind: ReportBlockKind;
  splittable: boolean;
  title: string;
  tone: ReportSectionTone;
  segments: ReportFlowSegment[];
}

export interface ReportRichTextBlock extends BaseReportBlock {
  kind: 'rich-text';
  splittable: true;
}

export interface ReportAtomicBlock extends BaseReportBlock {
  kind: 'atomic';
  splittable: false;
}

export type ReportBlock = ReportRichTextBlock | ReportAtomicBlock;

export interface PaginatedReportBlock {
  key: string;
  blockKind: ReportBlockKind;
  isContinuation: boolean;
  segments: ReportFlowSegment[];
  title: string;
  tone: ReportSectionTone;
}

export interface PaginatedReportPage {
  blocks: PaginatedReportBlock[];
}

interface MeasureBlockInput {
  block: ReportBlock;
  isContinuation: boolean;
  segments: ReportFlowSegment[];
}

export type MeasureReportBlock = (input: MeasureBlockInput) => number;

interface PaginateReportBlocksOptions {
  blocks: ReportBlock[];
  firstPageHeight: number;
  laterPageHeight: number;
  measureBlock: MeasureReportBlock;
  pageGap: number;
}

interface FittingFragmentResult {
  height: number;
  remainingSegments: ReportFlowSegment[];
  segments: ReportFlowSegment[];
}

export function normalizeReportText(text?: string | null): string {
  return text?.replace(/\r\n/g, '\n').trimEnd() ?? '';
}

export function parseReportSegments(
  text: string,
  blockKey: string
): ReportFlowSegment[] {
  if (!text.trim()) {
    return [];
  }

  const lines = normalizeReportText(text).split('\n');
  const segments: ReportFlowSegment[] = [];
  const paragraphBuffer: string[] = [];
  let paragraphIndex = 0;
  let bulletIndex = 0;
  let spacerIndex = 0;

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }

    segments.push({
      id: `${blockKey}-paragraph-${paragraphIndex}`,
      kind: 'paragraph',
      text: paragraphBuffer.join('\n'),
    });
    paragraphBuffer.length = 0;
    paragraphIndex += 1;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      if (segments.at(-1)?.kind !== 'spacer') {
        segments.push({
          id: `${blockKey}-spacer-${spacerIndex}`,
          kind: 'spacer',
          text: '',
        });
        spacerIndex += 1;
      }
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      segments.push({
        id: `${blockKey}-bullet-${bulletIndex}`,
        kind: 'bullet',
        text: bulletMatch[1] ?? '',
      });
      bulletIndex += 1;
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  while (segments[0]?.kind === 'spacer') {
    segments.shift();
  }

  while (segments.at(-1)?.kind === 'spacer') {
    segments.pop();
  }

  return segments;
}

function cloneSegment(
  segment: ReportFlowSegment,
  text: string
): ReportFlowSegment {
  return {
    ...segment,
    text,
  };
}

function trimBoundarySpacers(
  segments: ReportFlowSegment[]
): ReportFlowSegment[] {
  const normalized = [...segments];

  while (normalized[0]?.kind === 'spacer') {
    normalized.shift();
  }

  while (normalized.at(-1)?.kind === 'spacer') {
    normalized.pop();
  }

  return normalized;
}

function trimLeadingSpacers(
  segments: ReportFlowSegment[]
): ReportFlowSegment[] {
  const normalized = [...segments];

  while (normalized[0]?.kind === 'spacer') {
    normalized.shift();
  }

  return normalized;
}

function refineSplitBoundary(text: string, rawEnd: number): number {
  if (rawEnd >= text.length) {
    return text.length;
  }

  const candidate = text.slice(0, rawEnd);
  const whitespaceBoundary = Math.max(
    candidate.lastIndexOf('\n'),
    candidate.lastIndexOf(' ')
  );

  if (whitespaceBoundary <= 0) {
    return rawEnd;
  }

  return whitespaceBoundary + 1;
}

function findBestSplitForSegment({
  acceptedSegments,
  availableHeight,
  block,
  isContinuation,
  measureBlock,
  segment,
}: {
  acceptedSegments: ReportFlowSegment[];
  availableHeight: number;
  block: ReportBlock;
  isContinuation: boolean;
  measureBlock: MeasureReportBlock;
  segment: ReportFlowSegment;
}): {
  headSegment: ReportFlowSegment | null;
  height: number;
  tailSegment: ReportFlowSegment | null;
} {
  if (!segment.text.length) {
    return {
      headSegment: null,
      height: 0,
      tailSegment: segment,
    };
  }

  let low = 1;
  let high = segment.text.length;
  let bestLength = 0;
  let bestHeight = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidateLength = refineSplitBoundary(segment.text, mid);
    const candidateSegment = cloneSegment(
      segment,
      segment.text.slice(0, candidateLength)
    );
    const candidateHeight = measureBlock({
      block,
      isContinuation,
      segments: [...acceptedSegments, candidateSegment],
    });

    if (candidateHeight <= availableHeight) {
      bestLength = candidateLength;
      bestHeight = candidateHeight;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestLength <= 0) {
    return {
      headSegment: null,
      height: 0,
      tailSegment: segment,
    };
  }

  return {
    headSegment: cloneSegment(segment, segment.text.slice(0, bestLength)),
    height: bestHeight,
    tailSegment:
      bestLength < segment.text.length
        ? cloneSegment(segment, segment.text.slice(bestLength))
        : null,
  };
}

function buildFittingFragment({
  availableHeight,
  block,
  isContinuation,
  measureBlock,
  pendingSegments,
}: {
  availableHeight: number;
  block: ReportBlock;
  isContinuation: boolean;
  measureBlock: MeasureReportBlock;
  pendingSegments: ReportFlowSegment[];
}): FittingFragmentResult {
  if (pendingSegments.length === 0) {
    return {
      height: measureBlock({
        block,
        isContinuation,
        segments: [],
      }),
      remainingSegments: [],
      segments: [],
    };
  }

  const acceptedSegments: ReportFlowSegment[] = [];
  let acceptedHeight = 0;

  for (const [index, segment] of pendingSegments.entries()) {
    if (acceptedSegments.length === 0 && segment.kind === 'spacer') {
      continue;
    }

    const candidateSegments = [...acceptedSegments, segment];
    const candidateHeight = measureBlock({
      block,
      isContinuation,
      segments: candidateSegments,
    });

    if (candidateHeight <= availableHeight) {
      acceptedSegments.push(segment);
      acceptedHeight = candidateHeight;
      continue;
    }

    if (!block.splittable || segment.kind === 'spacer') {
      return {
        height: acceptedHeight,
        remainingSegments: trimLeadingSpacers(pendingSegments.slice(index)),
        segments: trimBoundarySpacers(acceptedSegments),
      };
    }

    const splitResult = findBestSplitForSegment({
      acceptedSegments,
      availableHeight,
      block,
      isContinuation,
      measureBlock,
      segment,
    });

    if (splitResult.headSegment) {
      return {
        height: splitResult.height,
        remainingSegments: trimLeadingSpacers([
          ...(splitResult.tailSegment ? [splitResult.tailSegment] : []),
          ...pendingSegments.slice(index + 1),
        ]),
        segments: trimBoundarySpacers([
          ...acceptedSegments,
          splitResult.headSegment,
        ]),
      };
    }

    return {
      height: acceptedHeight,
      remainingSegments: trimLeadingSpacers(pendingSegments.slice(index)),
      segments: trimBoundarySpacers(acceptedSegments),
    };
  }

  return {
    height: acceptedHeight,
    remainingSegments: [],
    segments: trimBoundarySpacers(acceptedSegments),
  };
}

export function paginateReportBlocks({
  blocks,
  firstPageHeight,
  laterPageHeight,
  measureBlock,
  pageGap,
}: PaginateReportBlocksOptions): PaginatedReportPage[] {
  const normalizedFirstPageHeight = Math.max(1, firstPageHeight);
  const normalizedLaterPageHeight = Math.max(1, laterPageHeight);
  const pages: PaginatedReportPage[] = [{ blocks: [] }];
  let activePageIndex = 0;
  let remainingPageHeight = normalizedFirstPageHeight;

  const ensureFreshPage = () => {
    pages.push({ blocks: [] });
    activePageIndex += 1;
    remainingPageHeight = normalizedLaterPageHeight;
  };

  for (const block of blocks) {
    if (!block.splittable) {
      while (true) {
        const page = pages[activePageIndex];
        if (!page) {
          ensureFreshPage();
          continue;
        }

        const gapHeight = page.blocks.length > 0 ? pageGap : 0;
        const availableHeight = remainingPageHeight - gapHeight;
        const blockHeight = measureBlock({
          block,
          isContinuation: false,
          segments: block.segments,
        });

        if (page.blocks.length > 0 && blockHeight > availableHeight) {
          ensureFreshPage();
          continue;
        }

        page.blocks.push({
          blockKind: block.kind,
          isContinuation: false,
          key: `${block.key}-0`,
          segments: block.segments,
          title: block.title,
          tone: block.tone,
        });
        remainingPageHeight -= gapHeight + blockHeight;
        break;
      }

      continue;
    }

    const sourceSegments = block.segments.length > 0 ? [...block.segments] : [];
    let pendingSegments = sourceSegments;
    let fragmentIndex = 0;

    while (pendingSegments.length > 0 || fragmentIndex === 0) {
      const page = pages[activePageIndex];
      if (!page) {
        ensureFreshPage();
        continue;
      }

      const gapHeight = page.blocks.length > 0 ? pageGap : 0;
      const availableHeight = remainingPageHeight - gapHeight;
      const pageHasContent = page.blocks.length > 0;

      if (availableHeight <= 0) {
        ensureFreshPage();
        continue;
      }

      const fragment = buildFittingFragment({
        availableHeight,
        block,
        isContinuation: fragmentIndex > 0,
        measureBlock,
        pendingSegments,
      });

      if (fragment.segments.length === 0 && pendingSegments.length > 0) {
        if (pageHasContent) {
          ensureFreshPage();
          continue;
        }

        const forcedSegment = pendingSegments[0];
        if (!forcedSegment) {
          break;
        }

        if (forcedSegment.kind === 'spacer') {
          pendingSegments = trimLeadingSpacers(pendingSegments.slice(1));
          continue;
        }

        const forcedSplit = findBestSplitForSegment({
          acceptedSegments: [],
          availableHeight: Math.max(1, availableHeight),
          block,
          isContinuation: fragmentIndex > 0,
          measureBlock,
          segment: forcedSegment,
        });

        const headSegment =
          forcedSplit.headSegment ??
          cloneSegment(
            forcedSegment,
            forcedSegment.text.slice(
              0,
              Math.max(1, refineSplitBoundary(forcedSegment.text, 48))
            )
          );
        const tailSegment =
          forcedSplit.tailSegment ??
          (headSegment.text.length < forcedSegment.text.length
            ? cloneSegment(
                forcedSegment,
                forcedSegment.text.slice(headSegment.text.length)
              )
            : null);
        const forcedHeight =
          forcedSplit.height ||
          measureBlock({
            block,
            isContinuation: fragmentIndex > 0,
            segments: [headSegment],
          });

        page.blocks.push({
          blockKind: block.kind,
          isContinuation: fragmentIndex > 0,
          key: `${block.key}-${fragmentIndex}`,
          segments: [headSegment],
          title: block.title,
          tone: block.tone,
        });
        remainingPageHeight -= gapHeight + forcedHeight;
        pendingSegments = trimLeadingSpacers([
          ...(tailSegment ? [tailSegment] : []),
          ...pendingSegments.slice(1),
        ]);
        fragmentIndex += 1;

        if (pendingSegments.length > 0) {
          ensureFreshPage();
        }
        continue;
      }

      page.blocks.push({
        blockKind: block.kind,
        isContinuation: fragmentIndex > 0,
        key: `${block.key}-${fragmentIndex}`,
        segments: fragment.segments,
        title: block.title,
        tone: block.tone,
      });
      remainingPageHeight -= gapHeight + fragment.height;
      pendingSegments = fragment.remainingSegments;
      fragmentIndex += 1;

      if (pendingSegments.length > 0) {
        ensureFreshPage();
      }
    }
  }

  return pages.filter((page) => page.blocks.length > 0);
}

export function arePaginatedReportPagesEqual(
  left: PaginatedReportPage[],
  right: PaginatedReportPage[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftPage, pageIndex) => {
    const rightPage = right[pageIndex];
    if (!rightPage || leftPage.blocks.length !== rightPage.blocks.length) {
      return false;
    }

    return leftPage.blocks.every((leftBlock, blockIndex) => {
      const rightBlock = rightPage.blocks[blockIndex];
      if (!rightBlock) {
        return false;
      }

      return (
        leftBlock.key === rightBlock.key &&
        leftBlock.blockKind === rightBlock.blockKind &&
        leftBlock.isContinuation === rightBlock.isContinuation &&
        leftBlock.title === rightBlock.title &&
        leftBlock.tone === rightBlock.tone &&
        leftBlock.segments.length === rightBlock.segments.length &&
        leftBlock.segments.every((leftSegment, segmentIndex) => {
          const rightSegment = rightBlock.segments[segmentIndex];

          return (
            rightSegment &&
            rightSegment.id === leftSegment.id &&
            rightSegment.kind === leftSegment.kind &&
            rightSegment.text === leftSegment.text
          );
        })
      );
    });
  });
}
