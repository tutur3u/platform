import { act, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportPreviewViewport } from '../report-preview-viewport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('fits the visible sheet when the panel shrinks and never enlarges A4', () => {
  let width = 400;
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    () => width
  );
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  const { container, unmount } = render(
    <ReportPreviewViewport>
      <div>Report</div>
    </ReportPreviewViewport>
  );
  const sheet = container.querySelector('[style]') as HTMLElement;
  expect(sheet.style.zoom).toBe('0.5');
  width = 320;
  act(() => resize());
  expect(sheet.style.zoom).toBe('0.4');
  width = 1000;
  act(() => resize());
  expect(sheet.style.zoom).toBe('1');
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
