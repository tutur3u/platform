import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReportPreview from '../report-preview';

const t = (key: string) =>
  (
    ({
      'common.empty': 'Empty',
      'common.untitled': 'Untitled',
      'ws-reports.continued': 'Continued',
      'ws-reports.pagination_updating': 'Updating A4 page flow...',
      'ws-reports.preview_pages_description':
        'Jump between pages without scrolling through the full export stack.',
      'ws-reports.report': 'Report',
      'ws-reports.report_closing_heading': 'Closing note',
      'ws-reports.report_feedback_heading': 'Teacher feedback',
      'ws-reports.report_overview_heading': 'Learning summary',
      'ws-reports.report_overview_description':
        'Lesson highlights, completed study content, and classroom progress are organized below.',
      'ws-reports.representative_score': 'Representative score',
    }) as Record<string, string>
  )[key] ?? key;

function createRect(height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: 100,
    toJSON: () => ({}),
    top: 0,
    width: 100,
    x: 0,
    y: 0,
  } as DOMRect;
}

describe('ReportPreview', () => {
  let originalClientHeight: PropertyDescriptor | undefined;
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', ((
      callback: FrameRequestCallback
    ) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal(
      'cancelAnimationFrame',
      (() => undefined) as typeof cancelAnimationFrame
    );

    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: Promise.resolve(),
      },
    });

    originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight'
    );
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        const className =
          typeof this.className === 'string' ? this.className : '';

        if (className.includes('min-h-0 flex-1 flex-col')) {
          return 260;
        }

        return 0;
      },
    });

    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockRect(this: HTMLElement) {
        const className =
          typeof this.className === 'string' ? this.className : '';
        const textLength = this.textContent?.length ?? 0;

        if (className.includes('rounded-[24px]')) {
          return createRect(52 + Math.ceil(textLength / 90) * 26);
        }

        return createRect(0);
      });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getBoundingClientRectSpy.mockRestore();

    if (originalClientHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'clientHeight',
        originalClientHeight
      );
    }
  });

  it('emits canonical page count and repaginates when content changes', async () => {
    const onPaginationStateChange = vi.fn();
    const getConfig = (id: string) =>
      (
        ({
          BRAND_NAME: 'Easy',
          BRAND_PHONE_NUMBER: '0123 456 789',
          REPORT_INTRO: 'Intro text',
        }) as Record<string, string>
      )[id] ?? null;

    const { container, rerender } = render(
      <ReportPreview
        t={t}
        lang="en"
        data={{
          title: 'Monthly report',
          content: 'Short content',
          score: '85.0',
          feedback: 'Short feedback',
        }}
        parseDynamicText={(text) => text ?? null}
        getConfig={getConfig}
        theme="light"
        previewPageIndex={0}
        singlePagePreview
        onPaginationStateChange={onPaginationStateChange}
      />
    );

    await waitFor(() =>
      expect(onPaginationStateChange).toHaveBeenLastCalledWith({
        pageCount: 1,
        ready: true,
      })
    );

    rerender(
      <ReportPreview
        t={t}
        lang="en"
        data={{
          title: 'Monthly report',
          content: Array.from({ length: 260 }, (_, index) => `content${index}`)
            .join(' ')
            .trim(),
          score: '85.0',
          feedback: Array.from(
            { length: 220 },
            (_, index) => `feedback${index}`
          )
            .join(' ')
            .trim(),
        }}
        parseDynamicText={(text) => text ?? null}
        getConfig={getConfig}
        theme="light"
        previewPageIndex={0}
        singlePagePreview
        onPaginationStateChange={onPaginationStateChange}
      />
    );

    await waitFor(() => {
      const lastCall =
        onPaginationStateChange.mock.calls[
          onPaginationStateChange.mock.calls.length - 1
        ]?.[0];

      expect(lastCall).toMatchObject({
        pageCount: expect.any(Number),
        ready: true,
      });
      expect(lastCall?.pageCount).toBeGreaterThan(1);
    });

    const lastReadyState =
      onPaginationStateChange.mock.calls[
        onPaginationStateChange.mock.calls.length - 1
      ]?.[0];
    const exportPages = container.querySelectorAll(
      '[data-report-export-stack] [data-report-page]'
    );
    const allRenderedPages = container.querySelectorAll('[data-report-page]');

    expect(exportPages).toHaveLength(lastReadyState?.pageCount ?? 0);
    expect(allRenderedPages).toHaveLength((lastReadyState?.pageCount ?? 0) + 1);
  });
});
