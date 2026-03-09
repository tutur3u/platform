import { describe, expect, it } from 'vitest';
import {
  type MeasureReportBlock,
  paginateReportBlocks,
  parseReportSegments,
  type ReportBlock,
} from '../report-preview-pagination';

const measureBlock: MeasureReportBlock = ({ segments }) => {
  let height = 28;

  for (const segment of segments) {
    if (segment.kind === 'spacer') {
      height += 12;
      continue;
    }

    height += Math.max(24, Math.ceil(segment.text.length / 42) * 18);
  }

  return height;
};

function collectBlockText(blocks: ReturnType<typeof paginateReportBlocks>) {
  return blocks
    .flatMap((page) => page.blocks)
    .flatMap((block) => block.segments)
    .map((segment) => `${segment.kind}:${segment.id}:${segment.text}`)
    .join('|');
}

describe('report-preview-pagination', () => {
  it('splits a long paragraph across multiple pages without dropping text', () => {
    const paragraph = Array.from({ length: 180 }, (_, index) => `word${index}`)
      .join(' ')
      .trim();
    const sourceSegments = parseReportSegments(paragraph, 'content');
    const pages = paginateReportBlocks({
      blocks: [
        {
          key: 'content',
          kind: 'rich-text',
          segments: sourceSegments,
          splittable: true,
          title: 'Content',
          tone: 'primary',
        },
      ],
      firstPageHeight: 180,
      laterPageHeight: 180,
      measureBlock,
      pageGap: 16,
    });

    expect(pages.length).toBeGreaterThan(1);
    const renderedParagraph = pages
      .flatMap((page) => page.blocks)
      .flatMap((block) => block.segments)
      .filter((segment) => segment.kind === 'paragraph')
      .map((segment) => segment.text)
      .join('');

    expect(renderedParagraph).toBe(paragraph);
  });

  it('splits bullet lists by item first and then within an oversized item', () => {
    const oversizedBullet = Array.from(
      { length: 120 },
      (_, index) => `detail${index}`
    ).join(' ');
    const sourceSegments = parseReportSegments(
      ['- One', '- Two', `- ${oversizedBullet}`, '- Final'].join('\n'),
      'feedback'
    );
    const pages = paginateReportBlocks({
      blocks: [
        {
          key: 'feedback',
          kind: 'rich-text',
          segments: sourceSegments,
          splittable: true,
          title: 'Feedback',
          tone: 'neutral',
        },
      ],
      firstPageHeight: 150,
      laterPageHeight: 150,
      measureBlock,
      pageGap: 16,
    });

    expect(pages.length).toBeGreaterThan(1);
    const initialBulletTexts = pages[0]?.blocks[0]?.segments
      .slice(0, 2)
      .map((segment) => segment.text);

    expect(initialBulletTexts).toEqual(['One', 'Two']);

    const oversizedBulletText = pages
      .flatMap((page) => page.blocks)
      .flatMap((block) => block.segments)
      .filter((segment) => segment.id === 'feedback-bullet-2')
      .map((segment) => segment.text)
      .join('');

    expect(oversizedBulletText).toBe(oversizedBullet);
  });

  it('moves atomic blocks to the next page when there is not enough remaining space', () => {
    const blocks: ReportBlock[] = [
      {
        key: 'summary',
        kind: 'rich-text',
        segments: parseReportSegments(
          Array.from({ length: 34 }, (_, index) => `summary${index}`).join(' '),
          'summary'
        ),
        splittable: true,
        title: 'Summary',
        tone: 'primary',
      },
      {
        key: 'notice',
        kind: 'atomic',
        segments: parseReportSegments('Short notice', 'notice'),
        splittable: false,
        title: 'Notice',
        tone: 'accent',
      },
    ];
    const pages = paginateReportBlocks({
      blocks,
      firstPageHeight: 120,
      laterPageHeight: 180,
      measureBlock,
      pageGap: 16,
    });

    expect(pages).toHaveLength(2);
    expect(pages[0]?.blocks).toHaveLength(1);
    expect(pages[1]?.blocks.some((block) => block.blockKind === 'atomic')).toBe(
      true
    );
  });

  it('preserves fragment order and avoids empty overflow pages for short content', () => {
    const blocks: ReportBlock[] = [
      {
        key: 'content',
        kind: 'rich-text',
        segments: parseReportSegments('Short content', 'content'),
        splittable: true,
        title: 'Content',
        tone: 'primary',
      },
      {
        key: 'feedback',
        kind: 'rich-text',
        segments: parseReportSegments('Short feedback', 'feedback'),
        splittable: true,
        title: 'Feedback',
        tone: 'neutral',
      },
    ];
    const pages = paginateReportBlocks({
      blocks,
      firstPageHeight: 400,
      laterPageHeight: 400,
      measureBlock,
      pageGap: 16,
    });

    expect(pages).toHaveLength(1);
    expect(collectBlockText(pages)).toBe(
      collectBlockText([
        {
          blocks: blocks.map((block, index) => ({
            blockKind: block.kind,
            isContinuation: false,
            key: `${block.key}-${index}`,
            segments: block.segments,
            title: block.title,
            tone: block.tone,
          })),
        },
      ])
    );
  });
});
