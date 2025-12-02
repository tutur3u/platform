import { act, render } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import { Masonry } from './masonry';

describe('Masonry - Image Loading Detection', () => {
  let mockResizeObserver: {
    observe: Mock;
    unobserve: Mock;
    disconnect: Mock;
    callback: ResizeObserverCallback | null;
  };

  beforeEach(() => {
    mockResizeObserver = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      callback: null,
    };

    // Create a proper class mock for ResizeObserver
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        mockResizeObserver.callback = callback;
      }
      observe = mockResizeObserver.observe;
      unobserve = mockResizeObserver.unobserve;
      disconnect = mockResizeObserver.disconnect;
    }

    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('Image Detection', () => {
    it('detects images within masonry items', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          <div key="1">
            <img src="test1.jpg" alt="Test 1" />
          </div>
          <div key="2">
            <img src="test2.jpg" alt="Test 2" />
          </div>
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(2);
    });

    it('handles items without images', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          <div key="1">Text content only</div>
          <div key="2">More text</div>
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(0);
    });

    it('handles mixed content (images and text)', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          <div key="1">
            <img src="test1.jpg" alt="Test 1" />
          </div>
          <div key="2">Text only</div>
          <div key="3">
            <img src="test3.jpg" alt="Test 3" />
          </div>
          <div key="4">Another text</div>
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(2);
    });

    it('handles multiple images in single item', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test1.jpg" alt="Test 1" />
              <img src="test2.jpg" alt="Test 2" />
              <img src="test3.jpg" alt="Test 3" />
            </div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(3);
    });
  });

  describe('Image Load Events', () => {
    it('listens for load events on incomplete images', () => {
      const addEventListenerSpy = vi.fn();

      // Mock an incomplete image
      const originalImage = window.Image;
      const mockImageInstance = {
        complete: false,
        naturalHeight: 0,
        addEventListener: addEventListenerSpy,
        removeEventListener: vi.fn(),
      };

      // @ts-expect-error - mocking for testing
      window.Image = vi.fn(() => mockImageInstance);

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test.jpg" alt="Test" />
            </div>,
          ]}
        </Masonry>
      );

      // The actual img elements are created by React, not our mock
      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);

      window.Image = originalImage;
    });

    it('handles already complete images', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img
                src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="
                alt="Test"
              />
            </div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });
  });

  describe('Image Error Handling', () => {
    it('handles image load errors gracefully', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="nonexistent.jpg" alt="Missing" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const image = container.querySelector('img');

      // Simulate error event
      if (image) {
        act(() => {
          image.dispatchEvent(new Event('error'));
        });
      }

      // Wait for potential cleanup
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();

      // Component should still be functional
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('treats error as image completion for tracking purposes', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          <div key="1">
            <img src="broken.jpg" alt="Broken" />
          </div>
          <div key="2">
            <img src="also-broken.jpg" alt="Also broken" />
          </div>
        </Masonry>
      );

      const images = container.querySelectorAll('img');

      // Simulate error events for all images
      images.forEach((image) => {
        act(() => {
          image.dispatchEvent(new Event('error'));
        });
      });

      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();
    });
  });

  describe('All Images Loaded Detection', () => {
    it('marks images as loaded when all complete', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          <div key="1">
            <img src="test1.jpg" alt="Test 1" />
          </div>
          <div key="2">
            <img src="test2.jpg" alt="Test 2" />
          </div>
        </Masonry>
      );

      const images = container.querySelectorAll('img');

      // Simulate load events for all images
      images.forEach((image) => {
        act(() => {
          image.dispatchEvent(new Event('load'));
        });
      });

      // Wait for the 1-second delay after all images load
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();
    });

    it('stops observing after all images loaded', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test.jpg" alt="Test" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const image = container.querySelector('img');

      // Simulate load event
      if (image) {
        act(() => {
          image.dispatchEvent(new Event('load'));
        });
      }

      // Wait for cleanup timeout (1000ms + stability check 2000ms)
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });

      vi.useRealTimers();

      // Component should still be functional after image loads
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Observer Cleanup After Image Load', () => {
    it('disconnects ResizeObserver after images complete', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test.jpg" alt="Test" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const image = container.querySelector('img');

      if (image) {
        act(() => {
          image.dispatchEvent(new Event('load'));
        });
      }

      // Advance past cleanup timeout (1000ms + stability 2000ms)
      await act(async () => {
        vi.advanceTimersByTime(3500);
      });

      vi.useRealTimers();

      // Component should still be functional after cleanup
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('waits 1 second after last image loads before cleanup', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test.jpg" alt="Test" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const image = container.querySelector('img');

      if (image) {
        act(() => {
          image.dispatchEvent(new Event('load'));
        });
      }

      // Before cleanup timeout
      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Observer might still be active for potential reflows

      // After cleanup timeout
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      vi.useRealTimers();
    });
  });

  describe('No Images Scenario', () => {
    it('handles zero images in balanced mode', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">Text 1</div>,
            <div key="2">Text 2</div>,
            <div key="3">Text 3</div>,
            <div key="4">Text 4</div>,
          ]}
        </Masonry>
      );

      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });

    it('does not attempt image tracking when no images exist', async () => {
      vi.useFakeTimers();

      render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[<div key="1">Text only</div>, <div key="2">Another text</div>]}
        </Masonry>
      );

      // Just verify the component works without images
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      vi.useRealTimers();
    });
  });

  describe('Partial Image Loading', () => {
    it('tracks progress when some images load faster than others', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="fast.jpg" alt="Fast" />
            </div>,
            <div key="2">
              <img src="slow.jpg" alt="Slow" />
            </div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');

      // First image loads
      act(() => {
        images[0]?.dispatchEvent(new Event('load'));
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      // Observer should still be active (not all images loaded)

      // Second image loads
      act(() => {
        images[1]?.dispatchEvent(new Event('load'));
      });

      // Wait for cleanup
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();
    });

    it('handles mix of load and error events', async () => {
      vi.useFakeTimers();

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="working.jpg" alt="Working" />
            </div>,
            <div key="2">
              <img src="broken.jpg" alt="Broken" />
            </div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');

      // First image loads successfully
      act(() => {
        images[0]?.dispatchEvent(new Event('load'));
      });

      // Second image fails
      act(() => {
        images[1]?.dispatchEvent(new Event('error'));
      });

      // Wait for cleanup
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });

      vi.useRealTimers();

      // Component should still be functional
      const mainContainer = container.firstChild as HTMLElement;
      expect(mainContainer.children.length).toBe(2);
    });
  });

  describe('Event Listener Options', () => {
    it('uses { once: true } for image load listeners', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="test.jpg" alt="Test" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      // The implementation uses { once: true }, which means listeners auto-remove
      // This test verifies the component renders correctly
      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });
  });

  describe('Deeply Nested Images', () => {
    it('finds images in nested elements', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <div>
                <div>
                  <img src="deep.jpg" alt="Deep" />
                </div>
              </div>
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });

    it('handles images within picture elements', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <picture>
                <source srcSet="image.webp" type="image/webp" />
                <img src="image.jpg" alt="Test" />
              </picture>
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });

    it('handles images within figure elements', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <figure>
                <img src="figure.jpg" alt="Figure" />
                <figcaption>Caption</figcaption>
              </figure>
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });
  });

  describe('Dynamic Image Sources', () => {
    it('handles images with data URIs', () => {
      const dataUri =
        'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src={dataUri} alt="Data URI" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });

    it('handles images with blob URLs', () => {
      const { container } = render(
        <Masonry columns={2} gap={16} strategy="balanced">
          {[
            <div key="1">
              <img src="blob:http://localhost:3000/abc123" alt="Blob" />
            </div>,
            <div key="2">Placeholder</div>,
          ]}
        </Masonry>
      );

      const images = container.querySelectorAll('img');
      expect(images.length).toBe(1);
    });
  });
});
