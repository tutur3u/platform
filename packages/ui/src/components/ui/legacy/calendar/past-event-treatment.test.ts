import { describe, expect, it } from 'vitest';
import { pastEventTreatment } from './past-event-treatment';

const event = {
  id: 'past',
  start_at: '2026-01-01T00:00:00Z',
  end_at: '2026-01-01T01:00:00Z',
};
const now = Date.parse('2026-01-02T00:00:00Z');
describe('past calendar treatment', () => {
  it('fades native events with an overlay above the opaque card', () => {
    expect(pastEventTreatment(event, false, false, now)).toContain(
      'after:bg-background/50'
    );
    expect(
      pastEventTreatment({ ...event, provider: 'tuturuuu' }, false, false, now)
    ).toContain('hover:after:opacity-0');
  });
  it('preserves adapters, provider events and interaction/preview states', () => {
    expect(pastEventTreatment(event, true, false, now)).toBeUndefined();
    expect(pastEventTreatment(event, false, true, now)).toBeUndefined();
    for (const value of [
      { ...event, provider: 'google' as const },
      { ...event, google_event_id: 'provider' },
      { ...event, _isPreview: true },
      { ...event, _optimisticStatus: 'updating' },
    ]) {
      expect(pastEventTreatment(value, false, false, now)).toBeUndefined();
    }
    expect(
      pastEventTreatment(event, false, false, Date.parse(event.end_at))
    ).toBeUndefined();
  });
});
