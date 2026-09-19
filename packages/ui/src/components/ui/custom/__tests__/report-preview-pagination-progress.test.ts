import { describe, expect, it } from 'vitest';
import {
  paginateReportBlocks,
  parseReportSegments,
} from '../report-preview-pagination';

describe.each([20, 200])(
  'report pagination progress with later page height %i',
  (laterPageHeight) => {
    it.each([
      'Short feedback',
      'Long feedback with spaces. '.repeat(12),
      'x'.repeat(150),
      '- First bullet\n- Second bullet that also cannot fit',
    ])('finishes and preserves every character: %s', (text) => {
      const segments = parseReportSegments(text, 'feedback');
      let measurements = 0;
      const pages = paginateReportBlocks({
        blocks: [
          {
            key: 'feedback',
            kind: 'rich-text',
            splittable: true,
            title: 'Feedback',
            tone: 'neutral',
            segments,
          },
        ],
        firstPageHeight: 1,
        laterPageHeight,
        pageGap: 16,
        measureBlock: () => {
          // Fail deterministically instead of hanging the test runner if the
          // fallback retries the same unconsumed segment forever.
          if (++measurements > 500)
            throw new Error('Pagination made no progress');
          return 100;
        },
      });

      const rendered = pages
        .flatMap((page) => page.blocks)
        .flatMap((block) => block.segments);
      for (const source of segments) {
        expect(
          rendered
            .filter((segment) => segment.id === source.id)
            .map((segment) => segment.text)
            .join('')
        ).toBe(source.text);
      }
      expect(pages.length).toBeLessThanOrEqual(text.length);
    });
  }
);

it.each([0, 1, 20, 60, 200])(
  'preserves mixed report sections with a %i-pixel page budget',
  (pageHeight) => {
    const content = parseReportSegments('Tiến bộ tốt. '.repeat(20), 'content');
    const feedback = parseReportSegments('- Review\n\n- Practice', 'feedback');
    let measurements = 0;
    const pages = paginateReportBlocks({
      blocks: [
        {
          key: 'empty',
          kind: 'rich-text',
          splittable: true,
          title: 'Empty',
          tone: 'neutral',
          segments: [],
        },
        {
          key: 'content',
          kind: 'rich-text',
          splittable: true,
          title: 'Content',
          tone: 'primary',
          segments: content,
        },
        {
          key: 'feedback',
          kind: 'rich-text',
          splittable: true,
          title: 'Feedback',
          tone: 'neutral',
          segments: feedback,
        },
        {
          key: 'closing',
          kind: 'atomic',
          splittable: false,
          title: 'Closing',
          tone: 'accent',
          segments: parseReportSegments('Thank you', 'closing'),
        },
      ],
      firstPageHeight: pageHeight,
      laterPageHeight: pageHeight,
      pageGap: 16,
      measureBlock: ({ segments }) => {
        if (++measurements > 1000)
          throw new Error('Pagination made no progress');
        return (
          40 +
          segments.reduce((height, segment) => height + segment.text.length, 0)
        );
      },
    });
    const output = pages
      .flatMap((page) => page.blocks)
      .flatMap((block) => block.segments);
    for (const segment of [...content, ...feedback].filter(
      (entry) => entry.kind !== 'spacer'
    )) {
      expect(
        output
          .filter((entry) => entry.id === segment.id)
          .map((entry) => entry.text)
          .join('')
      ).toBe(segment.text);
    }
    expect(
      output
        .filter((segment) => segment.id === 'closing-paragraph-0')
        .map((segment) => segment.text)
    ).toEqual(['Thank you']);
  }
);
