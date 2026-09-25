import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MotionToggle, StoryMotion } from './story-motion';

afterEach(() => vi.unstubAllGlobals());

it('keeps revealed sections steady after resuming while continuing to observe diagram visibility', () => {
  const observed: Element[][] = [];
  const callbacks: IntersectionObserverCallback[] = [];
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      targets: Element[] = [];
      constructor(callback: IntersectionObserverCallback) {
        observed.push(this.targets);
        callbacks.push(callback);
      }
      observe(target: Element) {
        this.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
    }
  );
  const { container } = render(
    <StoryMotion reveal>
      <main>
        <section>Already visible</section>
        <section>Not seen yet</section>
        <svg aria-label="Connected workflow">
          <title>Connected workflow</title>
          <path data-flow-line d="M0 0L10 10" />
        </svg>
      </main>
      <MotionToggle copy={{ pause: 'Pause motion', resume: 'Resume motion' }} />
    </StoryMotion>
  );
  const sections = container.querySelectorAll('section');
  act(() => {
    callbacks[0]?.(
      [
        { target: sections[0], isIntersecting: true },
      ] as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );
  });
  fireEvent.click(screen.getByRole('button', { name: 'Pause motion' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume motion' }));
  expect(observed[1]).not.toContain(sections[0]);
  expect(observed[1]).toContain(sections[1]);
  expect(observed[1]).toContain(container.querySelector('svg'));
});
