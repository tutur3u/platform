import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLandingReducedMotion } from './use-landing-reduced-motion';

let root: Root;
let container: HTMLDivElement;
let constrained: boolean;
let device: {
  hardwareConcurrency: number;
  deviceMemory: number;
  connection: {
    saveData: boolean;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
};
function Probe() {
  return <span>{String(useLandingReducedMotion())}</span>;
}
function read() {
  act(() => root.render(<Probe />));
  return container.textContent;
}
beforeEach(() => {
  constrained = false;
  device = {
    hardwareConcurrency: 8,
    deviceMemory: 8,
    connection: {
      saveData: false,
      addEventListener() {},
      removeEventListener() {},
    },
  };
  vi.stubGlobal('navigator', device);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({
    matches: constrained,
    addEventListener() {},
    removeEventListener() {},
  }));
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('landing motion capability policy', () => {
  it('allows enhancement only on an unconstrained desktop', () => {
    expect(read()).toBe('false');
  });
  it('honors reduced motion, mobile and coarse-pointer media matches', () => {
    constrained = true;
    expect(read()).toBe('true');
  });
  it('keeps low-core devices static', () => {
    device.hardwareConcurrency = 4;
    expect(read()).toBe('true');
  });
  it('keeps low-memory and data-saving devices static', () => {
    device.deviceMemory = 4;
    expect(read()).toBe('true');
    device.deviceMemory = 8;
    device.connection.saveData = true;
    expect(read()).toBe('true');
  });
  it('renders a static server snapshot', () => {
    expect(renderToString(<Probe />)).toContain('true');
  });
});
