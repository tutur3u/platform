import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('renders a null stat as unknown rather than zero', () => {
    render(<StatTile label="Queued" unknownLabel="Unknown" value={null} />);

    expect(screen.getByText('Unknown')).toBeTruthy();
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
      />
    );

    expect(document.querySelector('meter')?.getAttribute('value')).toBe('92');
    expect(screen.getByText('92%')).toBeTruthy();
    expect(
      container.querySelector('[data-tone]')?.getAttribute('data-tone')
    ).toBe('critical');
    expect(screen.getByTitle('Budget 80%')).toBeTruthy();
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
});
