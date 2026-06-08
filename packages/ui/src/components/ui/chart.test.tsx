import { renderToString } from 'react-dom/server';
import { Bar, BarChart } from 'recharts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartContainer } from './chart';

describe('ChartContainer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not emit Recharts dimension warnings during server rendering', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderToString(
      <ChartContainer
        className="h-64 w-full"
        config={{ clicks: { color: 'var(--primary)', label: 'Clicks' } }}
      >
        <BarChart data={[{ clicks: 1, day: 'Mon' }]}>
          <Bar dataKey="clicks" />
        </BarChart>
      </ChartContainer>
    );

    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('The width(-1) and height(-1) of chart')
    );
  });
});
