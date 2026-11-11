import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredLandingSections } from './deferred-landing-sections';

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="interactive-section" />,
}));

let root: Root;
let container: HTMLDivElement;
const render = (element: React.ReactNode) => act(() => root.render(element));
const count = () =>
  container.querySelectorAll('[data-testid="interactive-section"]');

let intersections: IntersectionObserverCallback[];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  intersections = [];
  history.replaceState(null, '', '/');
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersections.push(callback);
      }
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('landing viewport islands', () => {
  it('keeps expensive sections unmounted until they approach the viewport', () => {
    render(<DeferredLandingSections />);
    expect(count()).toHaveLength(0);
    act(() =>
      intersections[0]?.(
        [{ isIntersecting: true }] as IntersectionObserverEntry[],
        {} as IntersectionObserver
      )
    );
    expect(count()).toHaveLength(1);
  });

  it('mounts sections for a hash entered after initial load', () => {
    render(<DeferredLandingSections />);
    act(() => {
      history.replaceState(null, '', '/#pricing');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(count()).toHaveLength(5);
  });

  it('renders deep links without waiting for viewport observation', () => {
    history.replaceState(null, '', '/#demo');
    render(<DeferredLandingSections />);
    expect(count()).toHaveLength(5);
  });
});
