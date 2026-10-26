import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogLines } from './log-lines';
import { ResourceMeter } from './resource-meter';
import { StatTile } from './stat-tile';
import { StatePanel } from './state-panel';
import { StatusPill } from './status-pill';
import { getPressureTone } from './status-tone';

describe('ops primitives', () => {
  it('maps pressure to tones and keeps missing readings unknown', () => {
    expect(getPressureTone(null)).toBe('unknown');
    expect(getPressureTone(Number.NaN)).toBe('unknown');
    expect(getPressureTone(10)).toBe('positive');
    expect(getPressureTone(80)).toBe('warning');
    expect(getPressureTone(95)).toBe('critical');
    expect(getPressureTone(60, { warning: 50 })).toBe('warning');
  });

  it('renders a null stat with the supplied localized label rather than zero', () => {
    render(<StatTile label="Queued" unknownLabel="Chưa rõ" value={null} />);

    expect(screen.getByText('Chưa rõ')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    expect(
      screen
        .getByText('Queued')
        .closest('[data-tone]')
        ?.getAttribute('data-tone')
    ).toBe('unknown');
  });

  it('links a stat tile to its filtered view', () => {
    render(
      <StatTile
        href="/fleet?state=late"
        label="Late"
        tone="warning"
        unknownLabel="Unknown"
        value={2}
      />
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/fleet?state=late'
    );
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('hides a stale reading behind the unknown label', () => {
    render(
      <ResourceMeter
        label="Memory"
        percent={42}
        stale
        unknownLabel="No fresh reading"
      />
    );

    expect(document.querySelector('meter')).toBeNull();
    expect(screen.getByText('No fresh reading')).toBeTruthy();
    expect(screen.queryByText('42%')).toBeNull();
  });

  it('shows a fresh reading with its pressure tone and ceiling marker', () => {
    const { container } = render(
      <ResourceMeter
        label="Memory"
        limitLabel="Budget 80%"
        limitPercent={80}
        percent={92}
        unknownLabel="Unknown"
      />
    );

    const meter = screen.getByRole('meter', { name: 'Memory' });
    expect(meter.getAttribute('value')).toBe('92');
    expect(meter.getAttribute('min')).toBe('0');
    expect(meter.getAttribute('max')).toBe('100');
    expect(screen.getByText('92%')).toBeTruthy();
    expect(
      container.querySelector('[data-tone]')?.getAttribute('data-tone')
    ).toBe('critical');
    expect(screen.getByTitle('Budget 80%')).toBeTruthy();
  });

  it('names each meter from its visible JSX label', () => {
    render(
      <>
        <ResourceMeter
          label={<strong>Bộ nhớ</strong>}
          percent={42}
          unknownLabel="Chưa rõ"
        />
        <ResourceMeter
          label={<span>CPU</span>}
          percent={0}
          unknownLabel="Chưa rõ"
        />
      </>
    );

    const memory = screen.getByRole('meter', { name: 'Bộ nhớ' });
    const cpu = screen.getByRole('meter', { name: 'CPU' });
    expect(memory.getAttribute('aria-labelledby')).not.toBe(
      cpu.getAttribute('aria-labelledby')
    );
    expect(cpu.getAttribute('value')).toBe('0');
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    'renders the localized unknown label for missing or invalid reading %s',
    (percent) => {
      render(
        <ResourceMeter
          label="Bộ nhớ"
          percent={percent}
          unknownLabel="Chưa rõ"
        />
      );

      expect(screen.queryByRole('meter')).toBeNull();
      expect(screen.getByText('Chưa rõ')).toBeTruthy();
      expect(screen.queryByText('Unknown')).toBeNull();
    }
  );

  it.each([
    [-5, '0'],
    [105, '100'],
  ])('keeps reading %s within the accessible meter range', (percent, value) => {
    render(
      <ResourceMeter label="Memory" percent={percent} unknownLabel="Unknown" />
    );

    expect(
      screen.getByRole('meter', { name: 'Memory' }).getAttribute('value')
    ).toBe(value);
  });

  it('announces critical state panels as alerts with a recovery action', () => {
    render(
      <StatePanel
        action={<button type="button">Reconnect</button>}
        detail="Last heartbeat 20 minutes ago."
        title="Disconnected"
        tone="critical"
      />
    );

    expect(screen.getByRole('alert').textContent).toContain('Disconnected');
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
  });

  it('tags status pills with their tone', () => {
    render(<StatusPill tone="unknown">Outcome unknown</StatusPill>);

    expect(screen.getByText('Outcome unknown').getAttribute('data-tone')).toBe(
      'unknown'
    );
  });

  it('renders log text verbatim with tone and an empty state', () => {
    const { rerender } = render(
      <LogLines
        emptyLabel="No output"
        label="Run log"
        lines={[
          { id: '1', kind: 'log', text: '<b>not html</b>', time: '05:00:01' },
          { id: '2', kind: 'error', text: 'boom', tone: 'critical' },
        ]}
      />
    );

    expect(screen.getByRole('list', { name: 'Run log' })).toBeTruthy();
    expect(screen.getByText('<b>not html</b>')).toBeTruthy();
    expect(
      screen.getByText('boom').closest('li')?.getAttribute('data-tone')
    ).toBe('critical');

    rerender(<LogLines emptyLabel="No output" label="Run log" lines={[]} />);
    expect(screen.getByText('No output')).toBeTruthy();
  });
});
