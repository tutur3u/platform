import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeInitialTaskColumn } from './observe-initial-task-column';

afterEach(() => vi.unstubAllGlobals());
describe('initial task column loading', () => {
  it('loads page zero without IntersectionObserver', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const load = vi.fn().mockResolvedValue(undefined);
    observeInitialTaskColumn(document.createElement('div'), load);
    expect(load).toHaveBeenCalledOnce();
  });
  it('only loads on visibility and ignores duplicate or disposed callbacks', () => {
    let notify: IntersectionObserverCallback;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = disconnect;
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
      }
    );
    const load = vi.fn().mockResolvedValue(undefined);
    const cleanup = observeInitialTaskColumn(
      document.createElement('div'),
      load
    );
    const emit = (visible: boolean) =>
      notify(
        [{ isIntersecting: visible } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    emit(false);
    expect(load).not.toHaveBeenCalled();
    emit(true);
    emit(true);
    expect(load).toHaveBeenCalledOnce();
    cleanup?.();
    emit(true);
    expect(load).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalled();
  });
});
