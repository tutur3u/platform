// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMailImageLayout,
  attachMailImageResize,
  clampMailImageWidth,
  keyboardMailImageWidth,
  resizedMailImageWidth,
} from './mail-composer-image-resize';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

beforeEach(() => vi.stubGlobal('PointerEvent', TestPointerEvent));
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function fixture() {
  const root = document.createElement('div');
  root.className = 'ProseMirror';
  root.style.padding = '20px';
  Object.defineProperty(root, 'clientWidth', { value: 390 });
  const wrapper = document.createElement('span');
  const image = document.createElement('img');
  wrapper.append(image);
  root.append(wrapper);
  document.body.append(root);
  let stored = 200;
  wrapper.style.width = `${stored}px`;
  wrapper.getBoundingClientRect = () => {
    const width = Number.parseFloat(wrapper.style.width);
    return new DOMRect(0, 0, width, width / 2);
  };
  const restore = vi.fn(() => {
    wrapper.style.width = `${stored}px`;
  });
  const commit = vi.fn((width: number) => {
    stored = width;
    restore();
  });
  const controller = attachMailImageResize({
    commit,
    image,
    labels: () => ({
      label: 'Resize image',
      value: (width) => `${width} pixels wide`,
    }),
    restore,
    wrapper,
  });
  const handle = wrapper.querySelector<HTMLElement>('[role="slider"]');
  if (!handle) throw new Error('Resize slider missing');
  const pointer = (type: string, x: number, y = 0, pointerId = 1) =>
    handle.dispatchEvent(
      new TestPointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
      })
    );
  return { commit, controller, handle, image, pointer, restore, wrapper };
}

describe('image resize limits and controls', () => {
  it('clamps pixel widths to the minimum and available content width', () => {
    expect(clampMailImageWidth(10, 350)).toBe(48);
    expect(clampMailImageWidth(700, 350)).toBe(350);
    expect(clampMailImageWidth(200.6, 350)).toBe(201);
  });

  it.each([
    ['nw', -40, -20],
    ['ne', 40, -20],
    ['sw', -40, 20],
    ['se', 40, 20],
  ] as const)(
    'grows the %s corner with a locked aspect ratio',
    (corner, dx, dy) => {
      expect(
        resizedMailImageWidth({
          aspect: 2,
          corner,
          dx,
          dy,
          max: 350,
          startWidth: 200,
        })
      ).toBe(240);
    }
  );

  it('honors keyboard steps and bounds without consuming unrelated keys', () => {
    expect(keyboardMailImageWidth('ArrowRight', 200, 350)).toBe(210);
    expect(keyboardMailImageWidth('ArrowUp', 200, 350, true)).toBe(250);
    expect(keyboardMailImageWidth('ArrowLeft', 50, 350)).toBe(48);
    expect(keyboardMailImageWidth('ArrowDown', 200, 350)).toBe(190);
    expect(keyboardMailImageWidth('Home', 200, 350)).toBe(48);
    expect(keyboardMailImageWidth('End', 200, 350)).toBe(350);
    expect(keyboardMailImageWidth('Tab', 200, 350)).toBeNull();
  });

  it('retains the chosen wrapper width with a responsive image cap', () => {
    const { controller, image, wrapper } = fixture();
    applyMailImageLayout(wrapper, image, '600');
    expect(wrapper.style.width).toBe('600px');
    expect(wrapper.style.maxWidth).toBe('100%');
    expect(image.style.width).toBe('100%');
    expect(image.style.maxWidth).toBe('100%');
    controller.destroy();
  });
});

describe('image resize interaction', () => {
  it('previews pointer movement and commits once on release', () => {
    const { commit, controller, pointer, wrapper } = fixture();
    pointer('pointerdown', 0);
    pointer('pointermove', 40);
    expect(wrapper.style.width).toBe('240px');
    expect(controller.preview).toBe(240);
    expect(commit).not.toHaveBeenCalled();
    pointer('pointerup', 40);
    pointer('pointerup', 40);
    expect(commit).toHaveBeenCalledExactlyOnceWith(240);
    expect(controller.preview).toBeNull();
    controller.destroy();
  });

  it('caps drag preview at the content width on a 390px editor', () => {
    const { commit, controller, pointer, wrapper } = fixture();
    pointer('pointerdown', 0);
    pointer('pointermove', 900);
    expect(wrapper.style.width).toBe('350px');
    pointer('pointerup', 900);
    expect(commit).toHaveBeenCalledExactlyOnceWith(350);
    controller.destroy();
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    '%s restores the stored width',
    (event) => {
      const { commit, controller, pointer, wrapper } = fixture();
      pointer('pointerdown', 0);
      pointer('pointermove', 40);
      pointer(event, 40);
      expect(wrapper.style.width).toBe('200px');
      expect(commit).not.toHaveBeenCalled();
      expect(controller.preview).toBeNull();
      controller.destroy();
    }
  );

  it('Escape cancels a drag without storing its preview', () => {
    const { commit, controller, pointer, wrapper } = fixture();
    pointer('pointerdown', 0);
    pointer('pointermove', 40);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(wrapper.style.width).toBe('200px');
    expect(commit).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('ignores movement and release from another pointer', () => {
    const { commit, controller, pointer, wrapper } = fixture();
    pointer('pointerdown', 0);
    pointer('pointermove', 100, 0, 2);
    pointer('pointerup', 100, 0, 2);
    expect(wrapper.style.width).toBe('200px');
    expect(commit).not.toHaveBeenCalled();
    pointer('pointercancel', 0);
    controller.destroy();
  });

  it('exposes one keyboard slider and commits arrow keys with updated values', () => {
    const { commit, controller, handle, wrapper } = fixture();
    expect(wrapper.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(handle.getAttribute('aria-label')).toBe('Resize image');
    expect(handle.getAttribute('aria-valuemin')).toBe('48');
    expect(handle.getAttribute('aria-valuemax')).toBe('350');
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
    );
    expect(commit).toHaveBeenCalledExactlyOnceWith(210);
    expect(handle.getAttribute('aria-valuenow')).toBe('210');
    expect(handle.getAttribute('aria-valuetext')).toBe('210 pixels wide');
    controller.destroy();
  });

  it('destroy prevents subsequent pointer and keyboard commits', () => {
    const { commit, controller, handle, pointer, wrapper } = fixture();
    pointer('pointerdown', 0);
    pointer('pointermove', 40);
    controller.destroy();
    expect(wrapper.style.width).toBe('200px');
    pointer('pointerup', 40);
    pointer('pointerdown', 0);
    pointer('pointermove', 80);
    pointer('pointerup', 80);
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(commit).not.toHaveBeenCalled();
    expect(controller.preview).toBeNull();
  });
});
