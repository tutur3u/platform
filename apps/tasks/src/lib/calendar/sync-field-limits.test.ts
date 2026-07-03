import { describe, expect, it } from 'vitest';
import {
  sanitizeWorkspaceCalendarEventFields,
  WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS,
  WORKSPACE_CALENDAR_EVENT_LIMITS,
} from './sync-field-limits';

describe('sanitizeWorkspaceCalendarEventFields', () => {
  it('clamps title and description to workspace calendar limits', () => {
    const sanitized = sanitizeWorkspaceCalendarEventFields({
      title: 't'.repeat(WORKSPACE_CALENDAR_EVENT_LIMITS.title + 10),
      description: 'd'.repeat(WORKSPACE_CALENDAR_EVENT_LIMITS.description + 25),
      location: 'Office',
    });

    expect(sanitized.title).toHaveLength(WORKSPACE_CALENDAR_EVENT_LIMITS.title);
    expect(sanitized.description).toHaveLength(
      WORKSPACE_CALENDAR_EVENT_LIMITS.description
    );
    expect(sanitized.location).toBe('Office');
  });

  it('preserves nullish fields', () => {
    const sanitized = sanitizeWorkspaceCalendarEventFields({
      title: null,
      description: undefined,
    });

    expect(sanitized.title).toBeNull();
    expect(sanitized.description).toBeUndefined();
  });

  it('clamps multibyte text to byte-safe limits', () => {
    const title = '🎯'.repeat(WORKSPACE_CALENDAR_EVENT_LIMITS.title + 10);
    const description = '🧠'.repeat(
      WORKSPACE_CALENDAR_EVENT_LIMITS.description + 10
    );
    const sanitized = sanitizeWorkspaceCalendarEventFields({
      title,
      description,
    });

    expect(
      new TextEncoder().encode(sanitized.title ?? '').length
    ).toBeLessThanOrEqual(WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS.title);
    expect(
      new TextEncoder().encode(sanitized.description ?? '').length
    ).toBeLessThanOrEqual(WORKSPACE_CALENDAR_EVENT_BYTE_LIMITS.description);
    expect((sanitized.title ?? '').length).toBeLessThanOrEqual(
      WORKSPACE_CALENDAR_EVENT_LIMITS.title
    );
    expect((sanitized.description ?? '').length).toBeLessThanOrEqual(
      WORKSPACE_CALENDAR_EVENT_LIMITS.description
    );
  });
});
