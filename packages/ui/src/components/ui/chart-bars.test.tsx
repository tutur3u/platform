import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ChartBars } from './chart-bars';

beforeAll(() => {
  // Recharts sizes itself from a ResizeObserver; give it a fixed box.
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width: 480, height: 256 } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 480,
      bottom: 256,
      width: 480,
      height: 256,
      toJSON: () => ({}),
    }) as DOMRect;
  for (const key of ['clientWidth', 'offsetWidth'] as const)
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => 480,
    });
  for (const key of ['clientHeight', 'offsetHeight'] as const)
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get: () => 256,
    });
});

const data = [
  { day: 'Mon', commits: 0, waiting: 3 },
  { day: 'Tue', commits: 12, waiting: 5 },
  { day: 'Wed', commits: 7, waiting: 0 },
];

describe('ChartBars', () => {
  it('names the chart and draws a legend entry per series', async () => {
    render(
      <ChartBars
        label="Commits per day"
        data={data}
        xKey="day"
        series={[
          { key: 'commits', label: 'In production', color: 'var(--chart-2)' },
          { key: 'waiting', label: 'Waiting', color: 'var(--chart-3)' },
        ]}
        stacked
      />
    );
    expect(
      screen.getByRole('group', { name: 'Commits per day' })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.getByText('In production')).toBeInTheDocument();
      expect(screen.getByText('Waiting')).toBeInTheDocument();
    });
  });

  it('shows a tooltip with every series, including zero, on hover', async () => {
    const { container } = render(
      <ChartBars
        label="Commits per day"
        data={data}
        xKey="day"
        series={[
          { key: 'commits', label: 'In production', color: 'var(--chart-2)' },
          { key: 'waiting', label: 'Waiting', color: 'var(--chart-3)' },
        ]}
        valueFormatter={(value) => `${value} commits`}
        labelFormatter={(value) => `Day ${value}`}
        defaultIndex={0}
      />
    );
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="chart-tooltip"]')
      ).not.toBeNull();
    });
    const tooltip = container.querySelector('[data-slot="chart-tooltip"]');
    expect(tooltip).toHaveTextContent('Day');
    expect(tooltip).toHaveTextContent('In production');
    expect(tooltip).toHaveTextContent('Day Mon');
    expect(tooltip).toHaveTextContent('0 commits');
    expect(tooltip).toHaveTextContent('3 commits');
  });
});
